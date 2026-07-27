#!/usr/bin/env node
// 네이버 검색광고 관리 API — 캠페인/광고그룹/키워드 조회 및 on/off 도구
// 인증: lib/keyword/naver-searchad.ts 와 동일한 HMAC-SHA256 서명(`${ts}.${method}.${path}`)
// 사용:
//   node scripts/naver-ads.mjs inventory              # 전체 구조 읽기(끄지 않음)
//   node scripts/naver-ads.mjs off-except 울산         # '울산' 미포함 키워드 전부 OFF (--apply 없으면 미리보기)
//   node scripts/naver-ads.mjs off-except 울산 경주 --apply
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// .env.local 로드 (로컬 전용 스크립트)
function loadEnv() {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
loadEnv()

const BASE = 'https://api.searchad.naver.com'
const API_KEY = process.env.NAVER_SEARCHAD_API_KEY
const SECRET = process.env.NAVER_SEARCHAD_SECRET_KEY
const CUSTOMER = process.env.NAVER_SEARCHAD_CUSTOMER_ID
if (!API_KEY || !SECRET || !CUSTOMER) {
  console.error('환경변수 없음: NAVER_SEARCHAD_API_KEY / SECRET_KEY / CUSTOMER_ID')
  process.exit(1)
}

function sign(ts, method, path) {
  return crypto.createHmac('sha256', SECRET).update(`${ts}.${method}.${path}`).digest('base64')
}

async function api(method, apiPath, body) {
  const ts = Date.now().toString()
  const res = await fetch(`${BASE}${apiPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Timestamp': ts,
      'X-API-KEY': API_KEY,
      'X-Customer': CUSTOMER,
      'X-Signature': sign(ts, method, apiPath.split('?')[0]),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${apiPath} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

// ── 전체 구조 수집 ──
async function collect() {
  const campaigns = await api('GET', '/ncc/campaigns')
  const out = []
  for (const c of campaigns) {
    const adgroups = await api('GET', `/ncc/adgroups?nccCampaignId=${c.nccCampaignId}`)
    const groups = []
    for (const g of adgroups) {
      let keywords = []
      try {
        keywords = await api('GET', `/ncc/keywords?nccAdgroupId=${g.nccAdgroupId}`)
      } catch { /* 키워드 없는 그룹(파워콘텐츠 등)일 수 있음 */ }
      groups.push({ g, keywords })
    }
    out.push({ c, groups })
  }
  return out
}

function kwOn(k) {
  // userLock=true 이면 사용자가 OFF 한 상태. status/statusReason 도 참고.
  return !k.userLock
}

async function inventory() {
  const data = await collect()
  let totKw = 0, onKw = 0
  for (const { c, groups } of data) {
    console.log(`\n■ 캠페인: ${c.name}  [${c.campaignTp}]  ${c.userLock ? 'OFF' : 'ON'}  (id=${c.nccCampaignId})`)
    for (const { g, keywords } of groups) {
      const on = keywords.filter(kwOn).length
      totKw += keywords.length; onKw += on
      console.log(`  └ 그룹: ${g.name}  ${g.userLock ? 'OFF' : 'ON'}  · 키워드 ${keywords.length}개(ON ${on})`)
    }
  }
  console.log(`\n총 키워드 ${totKw}개 · 현재 ON ${onKw}개`)

  // 지역 분포 요약 — '울산' 포함 여부 기준
  const all = data.flatMap(d => d.groups.flatMap(x => x.keywords))
  const has = (kw, w) => (kw.keyword || '').includes(w)
  const ulsan = all.filter(k => has(k, '울산'))
  const gyeongju = all.filter(k => has(k, '경주'))
  const neither = all.filter(k => !has(k, '울산') && !has(k, '경주'))
  console.log(`\n[지역 태깅] '울산' 포함 ${ulsan.length} · '경주' 포함 ${gyeongju.length} · 둘 다 아님 ${neither.length}`)
  console.log(`⚠️ '둘 다 아님'에는 울주군·삼산동·무거동 등 실제 울산 지역명이 섞여 있을 수 있음 — 아래 샘플 확인`)
  console.log('  둘 다 아님 샘플 30개:')
  console.log('   ' + neither.slice(0, 30).map(k => k.keyword).join(', '))
}

// ── '울산'(및 추가 보존어) 미포함 키워드 OFF ──
async function offExcept(keepWords, apply) {
  const data = await collect()
  const all = data.flatMap(d => d.groups.flatMap(x => x.keywords))
  const keep = (k) => keepWords.some(w => (k.keyword || '').includes(w))
  const targets = all.filter(k => kwOn(k) && !keep(k)) // 현재 ON & 보존어 미포함 → 끌 대상
  console.log(`보존어: ${keepWords.join(', ')}`)
  console.log(`현재 ON 키워드 ${all.filter(kwOn).length}개 중 OFF 대상 ${targets.length}개`)
  if (!apply) {
    console.log('\n[미리보기] --apply 없이 실행됨 — 실제로 끄지 않음. 끌 키워드 40개 샘플:')
    console.log('  ' + targets.slice(0, 40).map(k => k.keyword).join(', '))
    console.log(`\n실제 적용하려면: node scripts/naver-ads.mjs off-except ${keepWords.join(' ')} --apply`)
    return
  }
  // 100개씩 벌크 PUT — PUT /ncc/keywords?fields=userLock (배열 바디)
  let done = 0
  const CHUNK = 100
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = targets.slice(i, i + CHUNK)
    try {
      await api('PUT', '/ncc/keywords?fields=userLock', batch.map(k => ({ nccKeywordId: k.nccKeywordId, userLock: true })))
      done += batch.length
      console.log(`  ...${done}/${targets.length} OFF`)
    } catch (e) {
      console.error('벌크 OFF 실패(이 배치 건너뜀):', String(e).slice(0, 160))
    }
    await new Promise(r => setTimeout(r, 300)) // 레이트리밋 여유
  }
  console.log(`\n완료: ${done}개 OFF (보존 ${all.length - targets.length}개는 그대로)`)
}

// 울산권 보존 프리셋 — '울산' 글자가 없어도 실제 울산인 하위 행정동·읍면 지역명.
// (구/군은 타 도시와 겹쳐 제외: 중구·남구·북구·동구·서구는 도시 불명이라 보존하지 않음)
const ULSAN_KEEP = [
  '울산', '울주', '삼남', '언양', '온산', '웅촌', '청량', '범서', '두동', '두서',
  '상북', '서생', '삼동', '무거', '옥동', '신정', '달동', '야음', '선암', '방어',
  '전하', '남목', '화봉', '농소', '천상', '호계', '봉계', '반구', '성남동', '우정',
  '삼산', '달천', '다운', '연암', '효문', '병영',
]

const [cmd, ...rest] = process.argv.slice(2)
const apply = rest.includes('--apply')
const words = rest.filter(w => w !== '--apply')

if (cmd === 'inventory') await inventory()
else if (cmd === 'off-except') await offExcept(words.length ? words : ['울산'], apply)
else if (cmd === 'keep-ulsan') {
  // 울산권만 남기고 전부 OFF. --gyeongju 로 경주 포함 보존.
  const keep = rest.includes('--gyeongju') ? [...ULSAN_KEEP, '경주'] : ULSAN_KEEP
  await offExcept(keep, apply)
}
else {
  console.log('사용법:')
  console.log('  node scripts/naver-ads.mjs inventory')
  console.log('  node scripts/naver-ads.mjs keep-ulsan [--gyeongju] [--apply]')
  console.log('  node scripts/naver-ads.mjs off-except 울산 [경주] [--apply]')
}
