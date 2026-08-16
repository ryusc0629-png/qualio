#!/usr/bin/env node
/**
 * 키 점검 — 교체한 API 키가 실제로 살아있는지 확인한다.
 *
 * 왜 필요한가: 키를 바꾸고 나면 "화면이 안 뜨는데 키 때문인지, 다른 버그인지"를 구분하기 어렵다.
 * 이 스크립트는 각 서비스에 읽기 전용 호출을 한 번씩 넣어보고 결과만 알려준다.
 *
 * ⚠️ 돈이 나가거나 고객에게 발송되는 호출은 하지 않는다(알림톡 발송·결제 승인·이미지 생성 등).
 *
 * 실행: npm run check:keys
 *   .env.local을 읽는다. Vercel(운영) 값을 보려면 `vercel env pull .env.local` 후 실행.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

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

const env = { ...loadEnv(), ...process.env }

const results = []
function record(name, status, detail) {
  results.push({ name, status, detail })
}

/** 서비스 쪽 일시 장애(5xx·시간 초과) — 키 문제가 아니므로 실패로 세지 않는다 */
class ServiceWarn extends Error {}

/**
 * 응답을 키 관점에서 판정한다.
 *  401/403 = 키가 거부됨(진짜 실패) / 5xx = 서비스 장애(경고) / 그 외 오류 = 실패
 */
function assertKeyAccepted(res, okStatuses = []) {
  if (res.status === 401 || res.status === 403) throw new Error('키가 거부됨(401/403) — 값을 다시 확인하세요')
  if (res.status >= 500) throw new ServiceWarn(`서비스 응답 이상(HTTP ${res.status}) — 키 문제는 아님`)
  if (!res.ok && !okStatuses.includes(res.status)) throw new Error(`HTTP ${res.status}`)
}

async function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('응답 없음(시간 초과)')), ms)),
  ])
}

/** 키가 없으면 '없음'으로 표시하고 호출은 건너뛴다 */
async function check(name, keys, fn) {
  const missing = keys.filter((k) => !env[k])
  if (missing.length > 0) {
    record(name, 'skip', `환경변수 없음: ${missing.join(', ')}`)
    return
  }
  // Vercel에서 '민감'으로 표시된 값은 내려받을 때 실제 값 대신 [SENSITIVE]가 온다.
  // 로컬에 값이 없는 것일 뿐 실서버에는 있으므로, 키가 틀린 것처럼 보이지 않게 구분한다.
  const sensitive = keys.filter((k) => env[k] === '[SENSITIVE]')
  if (sensitive.length > 0) {
    record(name, 'skip', '로컬에 값 없음(Vercel 민감 표시) — 실서버에는 설정돼 있음')
    return
  }
  try {
    const detail = await withTimeout(fn())
    record(name, 'ok', detail ?? '정상')
  } catch (e) {
    // 시간 초과도 서비스 쪽 문제로 본다(키가 틀리면 즉시 401이 온다)
    const isWarn = e instanceof ServiceWarn || (e instanceof Error && e.message.includes('시간 초과'))
    record(name, isWarn ? 'warn' : 'fail', e instanceof Error ? e.message : String(e))
  }
}

// ── Supabase (service_role) — 서버의 모든 DB 작업 ──
await check('Supabase service_role', ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], async () => {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/businesses?select=id&limit=1`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  assertKeyAccepted(res)
  const rows = await res.json()
  return `업체 테이블 읽기 성공 (${Array.isArray(rows) ? rows.length : 0}행 확인)`
})

// ── Supabase (anon) — 브라우저에서 쓰는 키. RLS가 걸려 있어 데이터는 안 나오는 게 정상 ──
await check('Supabase anon(브라우저)', ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'], async () => {
  // RLS가 걸려 있어 행은 안 나오는 게 정상 — 여기서는 '키가 받아들여지는지'만 본다
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/businesses?select=id&limit=1`, {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  })
  assertKeyAccepted(res)
  const rows = await res.json()
  const leaked = Array.isArray(rows) && rows.length > 0
  if (leaked) throw new Error('⚠️ 브라우저 키로 업체 정보가 읽힘 — RLS 확인 필요')
  return '키 유효 · 외부에서 데이터는 안 보임(정상)'
})

// ── Anthropic — 시방서·홍보 글 등 글 자동 작성 ──
await check('Anthropic(글 자동 작성)', ['ANTHROPIC_API_KEY'], async () => {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
  })
  assertKeyAccepted(res)
  return '키 유효'
})

// ── Solapi — 알림톡. 잔액 조회만 한다(발송 없음) ──
await check('Solapi(알림톡)', ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET'], async () => {
  const crypto = await import('node:crypto')
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(16).toString('hex')
  const signature = crypto
    .createHmac('sha256', env.SOLAPI_API_SECRET)
    .update(date + salt)
    .digest('hex')
  const res = await fetch('https://api.solapi.com/cash/v1/balance', {
    headers: {
      Authorization: `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
  })
  assertKeyAccepted(res)
  const body = await res.json()
  const balance = body?.balance ?? body?.point ?? null
  return balance != null ? `키 유효 · 잔액 ${Number(balance).toLocaleString('ko-KR')}원` : '키 유효'
})

// ── 포트원 V2 — 결제 검증에 쓰는 시크릿. 토큰 발급만 확인(결제 없음) ──
await check('포트원(결제)', ['PORTONE_V2_API_SECRET'], async () => {
  const res = await fetch('https://api.portone.io/payments?page[size]=1', {
    headers: { Authorization: `PortOne ${env.PORTONE_V2_API_SECRET}` },
  })
  assertKeyAccepted(res, [400]) // 400 = 조회 조건 문제일 뿐, 키는 통과한 것
  return '키 유효'
})

// ── 카카오 로컬 — 주소→좌표 변환(현장 GPS 표시) ──
await check('카카오(주소 변환)', ['KAKAO_REST_API_KEY'], async () => {
  const res = await fetch('https://dapi.kakao.com/v2/local/search/address.json?query=서울시청', {
    headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
  })
  assertKeyAccepted(res)
  return '키 유효'
})

// ── OpenAI (보조 생성) ──
await check('OpenAI', ['OPENAI_API_KEY'], async () => {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
  })
  assertKeyAccepted(res)
  return '키 유효'
})

// ── Vercel 토큰 — 고객사 자체 도메인 연결 ──
await check('Vercel(도메인 연결)', ['QUALIO_VERCEL_TOKEN'], async () => {
  const res = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${env.QUALIO_VERCEL_TOKEN}` },
  })
  assertKeyAccepted(res)
  return '키 유효'
})

// ── 웹푸시 VAPID — 키쌍이 짝인지(형식)만 확인. 실제 발송은 하지 않는다 ──
await check('웹푸시 VAPID', ['VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'], async () => {
  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = env.VAPID_PRIVATE_KEY
  if (pub.length < 80) throw new Error('공개키 형식이 이상함')
  if (priv.length < 40) throw new Error('비밀키 형식이 이상함')
  return '형식 정상 — 폰에서 실제 알림 테스트는 설정 화면에서 확인하세요'
})

// ── 값만 있으면 되는 항목 ──
for (const [label, key] of [
  ['크론 비밀값', 'CRON_SECRET'],
  ['관리자 이메일', 'ADMIN_EMAILS'],
  ['알림톡 발신번호', 'SOLAPI_SENDER_PHONE'],
  ['알림톡 채널ID', 'SOLAPI_KAKAO_PF_ID'],
]) {
  record(label, env[key] ? 'ok' : 'skip', env[key] ? '설정됨' : '환경변수 없음')
}

// ── 결과 출력 ──
const ICON = { ok: '✅', fail: '❌', skip: '⚠️ ', warn: '🟡' }
console.log('\n키 점검 결과\n')
for (const r of results) {
  console.log(`${ICON[r.status]} ${r.name.padEnd(22, ' ')} ${r.detail}`)
}

const failed = results.filter((r) => r.status === 'fail')
const skipped = results.filter((r) => r.status === 'skip')
const warned = results.filter((r) => r.status === 'warn')
console.log('')
if (warned.length > 0) {
  console.log(`🟡 ${warned.length}개는 서비스 쪽 응답이 이상했어요(키 문제 아님) — 잠시 후 다시 실행해보세요`)
}
if (failed.length > 0) {
  console.log(`❌ ${failed.length}개가 실패했어요 — 위 항목의 키를 다시 확인하세요`)
  process.exit(1)
}
console.log(`✅ 확인한 키는 모두 정상이에요${skipped.length > 0 ? ` (${skipped.length}개는 값이 없어 건너뜀)` : ''}`)
