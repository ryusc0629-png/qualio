#!/usr/bin/env node
/**
 * 계정(업체) 데이터 리셋 스크립트 — 온보딩을 처음부터 다시 체험하기 위한 용도.
 *
 * ⚠️ 운영 DB의 실제 데이터를 삭제합니다. 반드시 백업 후, 업체 ID 범위 안에서만 동작합니다.
 *
 * 안전장치
 *   1) 업체를 명시적으로 지정해야 함 (--email 또는 --business). 자동 추정 안 함.
 *   2) --confirm 없이 실행하면 "백업 + 삭제 예정 건수"만 출력하고 실제 삭제는 안 함(드라이런).
 *   3) 삭제 전 항상 JSON 백업을 scripts/backups/ 에 저장 (복구 가능).
 *   4) cascade에 의존하지 않고 자식→부모 순서로 명시 삭제 (범위 밖 데이터 안 건드림).
 *
 * 사용법
 *   # 1) 무엇이 지워질지 미리보기 + 백업만 (안전)
 *   node scripts/reset-account.mjs --email=ryusc0629@gmail.com
 *
 *   # 2) 가벼운 리셋 — 업체정보는 남기고 운영 데이터만 삭제 (체크리스트 1/6)
 *   node scripts/reset-account.mjs --email=ryusc0629@gmail.com --confirm
 *
 *   # 3) 완전 리셋 — 업체까지 삭제, 가입 화면(/onboarding)부터 (체크리스트 0/6)
 *   node scripts/reset-account.mjs --email=ryusc0629@gmail.com --confirm --full
 *
 *   # 업체 ID를 직접 알면:
 *   node scripts/reset-account.mjs --business=<uuid> --confirm
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── .env.local 로드 (의존성 없이 직접 파싱) ─────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    // .env.local 이 없으면 실제 환경변수에 의존
  }
}
loadEnv()

// ── 인자 파싱 ───────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : null
}
const hasFlag = (name) => args.includes(`--${name}`)

const email = getArg('email')
const businessArg = getArg('business')
const confirm = hasFlag('confirm')
const full = hasFlag('full')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[리셋] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local 확인).')
  process.exit(1)
}
if (!email && !businessArg) {
  console.error('[리셋] 업체를 지정하세요: --email=<가입이메일> 또는 --business=<업체ID>')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── 업체 ID 해석 ────────────────────────────────────────────────────────
async function resolveBusinessId() {
  if (businessArg) return businessArg

  // 이메일 → auth 유저 → profiles.business_id
  let page = 1
  let userId = null
  // listUsers 는 페이지네이션 — 최대 몇 페이지만 탐색
  while (page <= 20 && !userId) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) { console.error('[리셋] 유저 조회 실패:', error.message); process.exit(1) }
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())
    if (hit) userId = hit.id
    if (data.users.length < 200) break
    page++
  }
  if (!userId) { console.error(`[리셋] 이메일에 해당하는 유저를 못 찾음: ${email}`); process.exit(1) }

  const { data: profile } = await db.from('profiles').select('business_id').eq('id', userId).maybeSingle()
  if (!profile?.business_id) { console.error('[리셋] 해당 유저에게 연결된 업체가 없습니다.'); process.exit(1) }
  return profile.business_id
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────
async function idsOf(table, businessId) {
  const { data } = await db.from(table).select('id').eq('business_id', businessId)
  return (data ?? []).map((r) => r.id)
}
async function dump(table, column, values) {
  if (Array.isArray(values) && values.length === 0) return []
  const q = db.from(table).select('*')
  const { data, error } = Array.isArray(values) ? await q.in(column, values) : await q.eq(column, values)
  if (error) { console.warn(`  · 백업 건너뜀(${table}): ${error.message}`); return [] }
  return data ?? []
}
async function del(table, column, values, counters) {
  if (Array.isArray(values) && values.length === 0) return
  const q = db.from(table).delete({ count: 'exact' })
  const { count, error } = Array.isArray(values) ? await q.in(column, values) : await q.eq(column, values)
  if (error) { console.warn(`  · 삭제 실패(${table}): ${error.message}`); return }
  counters[table] = (counters[table] ?? 0) + (count ?? 0)
}

// ── 메인 ────────────────────────────────────────────────────────────────
async function main() {
  const businessId = await resolveBusinessId()
  console.log(`\n[리셋] 대상 업체 ID: ${businessId}`)
  console.log(`[리셋] 모드: ${full ? '완전 리셋(업체까지 삭제)' : '가벼운 리셋(업체정보 유지)'} / ${confirm ? '실제 삭제' : '드라이런(미삭제)'}\n`)

  // 부모 ID 수집 (자식 테이블을 범위 안에서만 지우기 위해)
  const bookingIds = await idsOf('bookings', businessId)
  const leadIds = await idsOf('leads', businessId)
  const postIds = await idsOf('biz_posts', businessId)
  const reportRows = bookingIds.length
    ? (await db.from('reports').select('id').in('booking_id', bookingIds)).data ?? []
    : []
  const reportIds = reportRows.map((r) => r.id)

  // 업체 직속(business_id) 테이블 — 자식이 있는 것은 뒤에서 따로 처리
  const businessTables = [
    'push_subscriptions', 'review_claims', 'surcharge_rules',
    'service_items', 'quote_tiers', 'contracts', 'customers',
    'subscriptions', 'quotes', 'workers',
  ]

  // ── 백업 ──────────────────────────────────────────────────────────────
  const backup = { businessId, mode: full ? 'full' : 'soft', createdAt: new Date().toISOString(), tables: {} }
  backup.tables.report_photos = await dump('report_photos', 'report_id', reportIds)
  backup.tables.reports = await dump('reports', 'booking_id', bookingIds)
  backup.tables.booking_items = await dump('booking_items', 'booking_id', bookingIds)
  backup.tables.booking_price_changes = await dump('booking_price_changes', 'booking_id', bookingIds)
  backup.tables.booking_workers = await dump('booking_workers', 'booking_id', bookingIds)
  backup.tables.lead_activities = await dump('lead_activities', 'lead_id', leadIds)
  backup.tables.post_views = await dump('post_views', 'post_id', postIds)
  backup.tables.bookings = await dump('bookings', 'business_id', businessId)
  backup.tables.leads = await dump('leads', 'business_id', businessId)
  backup.tables.biz_posts = await dump('biz_posts', 'business_id', businessId)
  for (const t of businessTables) backup.tables[t] = await dump(t, 'business_id', businessId)
  if (full) backup.tables.businesses = await dump('businesses', 'id', businessId)

  mkdirSync(resolve(__dirname, 'backups'), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = resolve(__dirname, 'backups', `reset-${businessId}-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))

  const totalRows = Object.values(backup.tables).reduce((s, rows) => s + rows.length, 0)
  console.log('[리셋] 백업 저장:', backupPath)
  console.log('[리셋] 백업된 행 수:')
  for (const [t, rows] of Object.entries(backup.tables)) {
    if (rows.length) console.log(`  · ${t}: ${rows.length}건`)
  }
  console.log(`[리셋] 합계 ${totalRows}건\n`)

  if (!confirm) {
    console.log('[리셋] 드라이런입니다 — 실제 삭제는 하지 않았습니다.')
    console.log('[리셋] 정말 지우려면 같은 명령에 --confirm 을 붙이세요.\n')
    return
  }

  // ── 삭제 (자식 → 부모 순서) ───────────────────────────────────────────
  const counters = {}
  await del('report_photos', 'report_id', reportIds, counters)
  await del('reports', 'booking_id', bookingIds, counters)
  await del('booking_items', 'booking_id', bookingIds, counters)
  await del('booking_price_changes', 'booking_id', bookingIds, counters)
  await del('booking_workers', 'booking_id', bookingIds, counters)
  await del('lead_activities', 'lead_id', leadIds, counters)
  await del('post_views', 'post_id', postIds, counters)

  await del('bookings', 'business_id', businessId, counters)
  await del('leads', 'business_id', businessId, counters)
  await del('biz_posts', 'business_id', businessId, counters)
  for (const t of businessTables) await del(t, 'business_id', businessId, counters)

  if (full) {
    // 업체 삭제 전, 소유자 프로필의 연결을 끊어 /onboarding 으로 보냄
    await db.from('profiles').update({ business_id: null }).eq('business_id', businessId)
    await del('businesses', 'id', businessId, counters)
  }

  console.log('[리셋] 삭제 완료:')
  for (const [t, n] of Object.entries(counters)) console.log(`  · ${t}: ${n}건`)
  console.log(`\n[리셋] 끝났습니다. ${full ? '가입 화면(/onboarding)부터 다시 시작하세요.' : '대시보드에서 온보딩 체크리스트가 다시 나타납니다.'}`)
  console.log(`[리셋] 되돌리려면 백업 파일 참고: ${backupPath}\n`)
}

main().catch((e) => { console.error('[리셋] 오류:', e); process.exit(1) })
