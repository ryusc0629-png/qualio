#!/usr/bin/env node
/**
 * RLS 잠금 점검 — 새 테이블에 RLS 켜는 걸 빠뜨렸는지 자동으로 잡는다.
 *
 * 왜 필요한가: public 스키마 테이블은 PostgREST로 자동 노출되고, anon 키는 브라우저에 그대로 실린다.
 * RLS를 안 켜면 외부에서 읽기·수정·삭제가 가능하다. Supabase가 메일로 알려주긴 하지만
 * 며칠 뒤에 오므로, 그 사이에 이미 열려 있는 셈이라 직접 잡는다.
 *
 * 두 가지를 본다.
 *  1) 정적 검사 — supabase/migrations 안의 create table 중 enable row level security 짝이 없는 것
 *  2) 실제 검사 — 배포된 DB에 anon 키(외부인과 동일한 조건)로 직접 읽어보고 데이터가 나오는 테이블
 *
 * 실행: node scripts/check-rls.mjs   (또는 npm run check:rls)
 * 문제가 있으면 종료 코드 1 — CI에 물릴 수 있다.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations')

// .env.local 로드 (dotenv 의존성 없이)
function loadEnv() {
  const p = path.join(ROOT, '.env.local')
  if (!fs.existsSync(p)) return {}
  const out = {}
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

// 1) 마이그레이션 파일 정적 검사
function scanMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return { created: new Set(), secured: new Set() }
  const created = new Set()
  const secured = new Set()
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    // create table [if not exists] [public.]name
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z0-9_]+)["']?/gi)) {
      created.add(m[1].toLowerCase())
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?["']?([a-z0-9_]+)["']?\s+enable\s+row\s+level\s+security/gi)) {
      secured.add(m[1].toLowerCase())
    }
  }
  return { created, secured }
}

// 2) 배포된 DB에 anon 키로 실제 읽기 시도 — 외부인과 똑같은 조건
async function probeAnonReadable(tables, url, anonKey) {
  const exposed = []
  for (const table of tables) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      })
      if (!res.ok) continue // 404(없는 테이블)·401 등은 노출 아님
      const rows = await res.json()
      // RLS가 켜져 있고 정책이 없으면 빈 배열이 온다. 실제 데이터가 나오면 열려 있는 것.
      if (Array.isArray(rows) && rows.length > 0) exposed.push(table)
    } catch {
      // 네트워크 오류는 무시 — 정적 검사만으로도 의미가 있다
    }
  }
  return exposed
}

const env = { ...loadEnv(), ...process.env }
const { created, secured } = scanMigrations()
const missing = [...created].filter((t) => !secured.has(t)).sort()

let failed = false

if (missing.length) {
  failed = true
  console.error(`\n❌ 마이그레이션에 RLS를 안 켠 테이블 ${missing.length}개`)
  for (const t of missing) console.error(`   - ${t}`)
  console.error('\n   해결: 마이그레이션 파일에 아래 줄을 추가하세요.')
  for (const t of missing) console.error(`   alter table public.${t} enable row level security;`)
} else {
  console.log(`✅ 마이그레이션 정적 검사 통과 (테이블 ${created.size}개)`)
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (url && anonKey) {
  const exposed = await probeAnonReadable([...created].sort(), url, anonKey)
  if (exposed.length) {
    failed = true
    console.error(`\n❌ 외부에서 실제로 읽히는 테이블 ${exposed.length}개 (anon 키만으로 데이터가 나옴)`)
    for (const t of exposed) console.error(`   - ${t}`)
    console.error('\n   해결: alter table public.<테이블> enable row level security;')
  } else {
    console.log('✅ 실제 노출 검사 통과 (anon 키로 읽히는 테이블 없음)')
  }
} else {
  console.log('⚠️  NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 가 없어 실제 노출 검사는 건너뜀')
}

process.exit(failed ? 1 : 0)
