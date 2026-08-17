#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// 캐러셀 이미지 폴더 → SNS 즉시 배포 (Ayrshare)
//   인스타·페이스북 = 캐러셀 전체 / 스레드 = 표지 1장 + 짧은 본문
//
// 사용법: node scripts/publish_carousel.mjs <이미지폴더> <캡션파일> [--dry]
// ─────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const [dir, capFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!dir || !capFile) throw new Error('사용법: node scripts/publish_carousel.mjs <이미지폴더> <캡션파일>')

// 캡션 파일에서 구분선으로 나뉜 채널별 본문을 뽑는다
function section(text, name) {
  const parts = text.split(/─{5,}\s*\n/)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].trim() === name) return (parts[i + 1] || '').trim()
  }
  return ''
}

const raw = readFileSync(capFile, 'utf8')
const igText = section(raw, '인스타그램')
let thText = section(raw, '스레드')
if (!igText || !thText) throw new Error('캡션에서 인스타그램/스레드 구간을 찾지 못했습니다')

// 스레드는 500자 제한 — 링크를 붙여도 넘지 않게 다듬는다
const LINK = 'https://qualio.co.kr'
if (!thText.includes('qualio.co.kr')) thText += `\n\n${LINK}`
if (thText.length > 500) throw new Error(`스레드 본문 ${thText.length}자 — 500자를 넘습니다`)

const files = readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort()
if (!files.length) throw new Error('이미지가 없습니다')
if (files.length > 10) throw new Error(`인스타 캐러셀은 10장까지입니다 (현재 ${files.length}장)`)

console.log(`이미지 ${files.length}장 / 인스타 본문 ${igText.length}자 / 스레드 본문 ${thText.length}자`)
if (DRY) {
  console.log('\n--- 인스타·페이스북 ---\n' + igText)
  console.log('\n--- 스레드 ---\n' + thText)
  process.exit(0)
}

function apiKey() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  const m = env.match(/^AYRSHARE_API_KEY=(.+)$/m)
  if (!m) throw new Error('.env.local에 AYRSHARE_API_KEY가 없습니다')
  return m[1].trim().replace(/^["']|["']$/g, '')
}

async function upload(key, file) {
  const fd = new FormData()
  fd.append('file', new Blob([readFileSync(file)], { type: 'image/png' }), path.basename(file))
  fd.append('fileName', path.basename(file))
  const r = await fetch('https://api.ayrshare.com/api/media/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.url) throw new Error(`업로드 실패(${r.status}): ${JSON.stringify(j).slice(0, 300)}`)
  return j.url
}

async function post(key, { text, mediaUrls, platforms }) {
  const r = await fetch('https://api.ayrshare.com/api/post', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: text, platforms, mediaUrls }),  // scheduleDate 없음 = 즉시
  })
  return { http: r.status, body: await r.json().catch(() => ({})) }
}

const key = apiKey()
console.log('이미지 업로드 중...')
const urls = []
for (const f of files) {
  urls.push(await upload(key, path.join(dir, f)))
  process.stdout.write('.')
}
console.log('\n업로드 완료')

const r1 = await post(key, { text: igText, mediaUrls: urls, platforms: ['instagram', 'facebook'] })
console.log('인스타·페이스북:', r1.http, JSON.stringify(r1.body).slice(0, 400))

const r2 = await post(key, { text: thText, mediaUrls: [urls[0]], platforms: ['threads'] })
console.log('스레드:', r2.http, JSON.stringify(r2.body).slice(0, 400))
