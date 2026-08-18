// 솔라피 알림톡 템플릿 목록 조회 (읽기 전용 — 발송하지 않음)
// 키는 .env.local에서만 읽고, 출력에는 절대 찍지 않는다.
import { readFileSync } from 'node:fs'
import { createHmac, randomBytes } from 'node:crypto'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const apiKey = env.SOLAPI_API_KEY
const apiSecret = env.SOLAPI_API_SECRET
const pfId = env.SOLAPI_KAKAO_PF_ID

if (!apiKey || !apiSecret) {
  console.error('로컬 .env.local에 SOLAPI 키가 없습니다.')
  process.exit(1)
}

const date = new Date().toISOString()
const salt = randomBytes(16).toString('hex')
const signature = createHmac('sha256', apiSecret).update(date + salt).digest('hex')
const auth = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`

const res = await fetch('https://api.solapi.com/kakao/v2/templates?limit=100', {
  headers: { Authorization: auth },
})

if (!res.ok) {
  console.error(`조회 실패 ${res.status} — ${(await res.text()).slice(0, 300)}`)
  process.exit(1)
}

const body = await res.json()
const list = body.templateList ?? body.templates ?? body

console.log('로컬 키 인증: 성공\n')
console.log('pfId 끝 6자리(로컬):', pfId ? pfId.slice(-6) : '없음', '\n')
console.log('이름'.padEnd(28), '상태'.padEnd(12), '버튼', ' 템플릿ID')
console.log('-'.repeat(92))

for (const t of Object.values(list)) {
  if (!t?.templateId) continue
  const name = String(t.name ?? '').padEnd(26)
  const status = String(t.status ?? '').padEnd(12)
  const btn = (t.buttons?.length ? `${t.buttons.length}개` : '없음').padEnd(5)
  console.log(`${name} ${status} ${btn} ${t.templateId}`)
}
