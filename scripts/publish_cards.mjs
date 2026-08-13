#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// 이미지 카드뉴스 SNS 즉시 배포 (Ayrshare)
//
// distribute.mjs는 영상 전용이라, 카드뉴스(이미지 캐러셀)용으로 분리했다.
// 인스타·페이스북은 캐러셀 전체, 스레드는 500자 제한이 있어 짧은 문구 + 표지 1장으로 나눠 보낸다.
// 유튜브는 이미지 게시가 안 되므로 제외.
//
// 사용법: node scripts/publish_cards.mjs [--dry]
// ─────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const DIR = path.join(homedir(), 'Downloads', '청모-600-카드뉴스')
const CARDS = Array.from({ length: 7 }, (_, i) => path.join(DIR, `card_${String(i + 1).padStart(2, '0')}.png`))
const CAFE_MEETUP = 'https://cafe.naver.com/chungmo2024/508'

const HASHTAGS = '#청소업 #청소창업 #청소업체 #입주청소 #건물청소 #상가청소 #사무실청소 #사장님 #자영업 #청소업의모든것'

// 인스타·페이스북 — 캐러셀 7장
const LONG = `청소업 사장님 600명이 모였습니다.

홍보에 신경도 못 썼는데 검색하다가, 소개받아서 한 명씩 들어와 600명이 됐습니다.
같은 방향을 보는 분들이 그만큼 많다는 뜻이겠죠.

카페에 올라오는 질문은 놀랄 만큼 똑같습니다.

평당 얼마를 불러야 할지 모르겠다
관리사무소는 어떻게 뚫는지 모르겠다
직원을 뽑아도 세 달을 못 간다
계약서 없이 일하다 돈을 못 받았다
블로그도 해봤는데 전화가 안 온다

지역도 경력도 다른데 막히는 지점은 똑같습니다.
청소업이 안 크는 건 기술이 없어서가 아닙니다. 제대로 알려주는 자리가 없어서입니다.

그래서 전국 청소업 모임을 권역별로 시작합니다.
수도권 · 충청 · 영남 · 호남 · 강원 · 제주

지방에 계신다고 서울까지 올라오실 필요 없게 만들겠습니다.

친목 모임이 아닙니다. 매 모임마다 그 일을 실제로 해내고 있는 분을 모셔서 세미나를 엽니다.
견적과 단가 설계, 법인·관리사무소 영업, 사람 뽑고 안 나가게 하기, 계약서와 정산, 전화가 오게 만드는 구조.
듣고 나가서 다음 주 현장에 바로 쓸 수 있는 것만 다룹니다.

계속 배우는 사람만 남습니다.
청소업 상위 1%가 모이는 자리로 만들겠습니다.

권역별 일정은 카페에서 가장 먼저 공지합니다.
네이버에 청소업의 모든 것으로 검색해 주세요.

${HASHTAGS}`

// 스레드 — 500자 제한
const SHORT = `청소업 사장님 600명이 모였습니다.

카페에 올라오는 질문은 놀랄 만큼 똑같습니다.
평당 얼마를 불러야 할지, 관리사무소는 어떻게 뚫는지, 직원은 왜 세 달을 못 버티는지.

지역도 경력도 다른데 막히는 지점은 같습니다.
기술이 없어서가 아니라, 제대로 알려주는 자리가 없어서입니다.

그래서 전국 청소업 모임을 권역별로 시작합니다.
수도권 · 충청 · 영남 · 호남 · 강원 · 제주

매 모임마다 바로 쓰는 노하우 세미나를 엽니다.
일정은 카페에서 먼저 공지합니다.

${CAFE_MEETUP}`

function loadKey() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  const m = env.match(/^AYRSHARE_API_KEY=(.+)$/m)
  if (!m) throw new Error('.env.local에 AYRSHARE_API_KEY가 없습니다')
  return m[1].trim().replace(/^["']|["']$/g, '')
}

async function upload(apiKey, filePath) {
  const fd = new FormData()
  fd.append('file', new Blob([readFileSync(filePath)], { type: 'image/png' }), path.basename(filePath))
  fd.append('fileName', path.basename(filePath))
  const r = await fetch('https://api.ayrshare.com/api/media/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.url) throw new Error(`업로드 실패(${r.status}): ${JSON.stringify(j).slice(0, 300)}`)
  return j.url
}

async function post(apiKey, { text, mediaUrls, platforms }) {
  const r = await fetch('https://api.ayrshare.com/api/post', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    // scheduleDate 없음 = 즉시 게시(예약 금지)
    body: JSON.stringify({ post: text, platforms, mediaUrls }),
  })
  return { http: r.status, body: await r.json().catch(() => ({})) }
}

const missing = CARDS.filter((p) => !existsSync(p))
if (missing.length) throw new Error(`카드 파일 없음: ${missing.join(', ')}`)

console.log(`인스타·페북 본문 ${LONG.length}자 / 스레드 본문 ${SHORT.length}자`)
if (SHORT.length > 500) throw new Error(`스레드 본문이 ${SHORT.length}자 — 500자를 넘습니다`)

if (DRY) {
  console.log('--- 인스타·페이스북 ---\n' + LONG + '\n\n--- 스레드 ---\n' + SHORT)
  process.exit(0)
}

const apiKey = loadKey()

console.log('이미지 7장 업로드 중...')
const urls = []
for (const p of CARDS) {
  urls.push(await upload(apiKey, p))
  process.stdout.write('.')
}
console.log('\n업로드 완료')

const r1 = await post(apiKey, { text: LONG, mediaUrls: urls, platforms: ['instagram', 'facebook'] })
console.log('인스타·페이스북:', r1.http, JSON.stringify(r1.body).slice(0, 500))

const r2 = await post(apiKey, { text: SHORT, mediaUrls: [urls[0]], platforms: ['threads'] })
console.log('스레드:', r2.http, JSON.stringify(r2.body).slice(0, 500))
