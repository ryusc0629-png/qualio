#!/usr/bin/env node
/**
 * 이미지 캐러셀을 인스타그램·스레드에 게시한다.
 *
 * distribute.mjs는 영상 전용(isVideo:true, 유튜브 쇼츠)이라 이미지 카드에는 못 쓴다.
 * 이 스크립트는 PNG 여러 장을 Ayrshare에 올린 뒤 캐러셀 한 건으로 게시한다.
 *
 * ⚠️ 유튜브는 대상이 아니다. 유튜브 API에는 커뮤니티 글 등록 기능이 없어서
 *    이미지 게시를 자동화할 방법이 없다(영상만 가능). 커뮤니티 탭은 손으로 올려야 한다.
 *
 * 사용법
 *   node scripts/publish-carousel.mjs --dir ~/Downloads/.../post2          # 미리보기(게시 안 함)
 *   node scripts/publish-carousel.mjs --dir ... --publish --now            # 실제 게시(즉시)
 *   node scripts/publish-carousel.mjs --dir ... --publish --now --only instagram
 *
 * --dir 안에 out/01.png… 와 캡션.txt 가 있어야 한다.
 * 캡션.txt 는 "인스타그램" / "스레드" 구획을 각각 잘라 채널별 문구로 쓴다.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const API = 'https://api.ayrshare.com/api'
const IG_HASHTAG_MAX = 10 // 초과 시 code 151로 전 채널 게시 거부
const THREADS_MAX = 500

// ── 인자 파싱 ────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (n) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined
}
const dirArg = flag('dir')
if (!dirArg || dirArg === true) {
  console.error('사용법: node scripts/publish-carousel.mjs --dir <폴더> [--publish --now]')
  process.exit(1)
}
const DIR = String(dirArg).replace(/^~/, os.homedir())
const DO_PUBLISH = argv.includes('--publish')
const NOW = argv.includes('--now')
const ONLY = flag('only') // instagram | threads

function loadApiKey() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (process.env.AYRSHARE_API_KEY) return process.env.AYRSHARE_API_KEY
  if (!existsSync(envPath)) throw new Error('.env.local 을 찾을 수 없습니다 (프로젝트 루트에서 실행하세요)')
  const m = readFileSync(envPath, 'utf8').match(/^AYRSHARE_API_KEY=(.*)$/m)
  if (!m) throw new Error('.env.local 에 AYRSHARE_API_KEY 가 없습니다')
  return m[1].trim()
}

// ── 캡션.txt 에서 채널 구획만 잘라낸다 ──────────────────
function readCaptions() {
  const p = path.join(DIR, '캡션.txt')
  if (!existsSync(p)) throw new Error(`캡션.txt 가 없습니다: ${p}`)
  const lines = readFileSync(p, 'utf8').split('\n')
  const isDiv = (s) => /^[─=]{5,}$/.test((s || '').trim())
  // 구획은 ──── 로 감싼 제목 줄로만 구분한다.
  // (본문 안의 "네이버 카페 청소업의 모든 것" 같은 문장을 제목으로 오인하면 뒤가 잘린다)
  const out = {}
  let cur = null
  let buf = []
  const flush = () => { if (cur) out[cur] = buf.join('\n').trim(); buf = [] }
  for (let i = 0; i < lines.length; i++) {
    if (isDiv(lines[i]) && isDiv(lines[i + 2])) {
      const head = (lines[i + 1] || '').trim()
      flush()
      cur = /인스타/.test(head) ? 'instagram' : /스레드/.test(head) ? 'threads' : null
      i += 2
      continue
    }
    if (isDiv(lines[i])) continue
    if (cur) buf.push(lines[i])
  }
  flush()
  return out
}

// 인스타는 해시태그 10개까지만 — 중복 제거 후 앞에서 자른다
function capHashtags(text) {
  const tags = text.match(/#[^\s#]+/g) || []
  if (tags.length <= IG_HASHTAG_MAX) return text
  const seen = new Set()
  const keep = []
  for (const t of tags) {
    const k = t.toLowerCase()
    if (!seen.has(k) && keep.length < IG_HASHTAG_MAX) { seen.add(k); keep.push(t) }
  }
  const body = text.replace(/#[^\s#]+/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return `${body}\n\n${keep.join(' ')}`
}

async function uploadImage(key, file) {
  const fd = new FormData()
  fd.append('file', new Blob([readFileSync(file)], { type: 'image/png' }), path.basename(file))
  fd.append('fileName', path.basename(file))
  const r = await fetch(`${API}/media/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.url) throw new Error(`업로드 실패(${r.status}) ${path.basename(file)}: ${JSON.stringify(j).slice(0, 200)}`)
  return j.url
}

// "2026-08-13 19:00"(KST) → UTC ISO
function toUtcIso(kst) {
  const m = String(kst).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) throw new Error(`--at 형식 오류: "${kst}" (예: "2026-08-13 19:00")`)
  const [, Y, Mo, D, H, Mi] = m
  return new Date(Date.UTC(+Y, +Mo - 1, +D, +H - 9, +Mi, 0)).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function post(key, { platform, text, mediaUrls, scheduleDate }) {
  const body = { post: text, platforms: [platform], mediaUrls }
  if (scheduleDate) body.scheduleDate = scheduleDate
  const r = await fetch(`${API}/post`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { http: r.status, json: await r.json().catch(() => ({})) }
}

// ── 실행 ─────────────────────────────────────────────
const outDir = path.join(DIR, 'out')
if (!existsSync(outDir)) throw new Error(`out 폴더가 없습니다: ${outDir}`)
const images = readdirSync(outDir).filter((f) => /^\d+\.png$/.test(f)).sort()
  .map((f) => path.join(outDir, f))
if (!images.length) throw new Error('out 폴더에 01.png 같은 이미지가 없습니다')

const caps = readCaptions()
const igText = capHashtags(caps.instagram || '')
const thText = (caps.threads || '').trim()

console.log(`\n📁 ${DIR}`)
console.log(`🖼  이미지 ${images.length}장: ${images.map((f) => path.basename(f)).join(', ')}`)
console.log(`\n── 인스타그램 (${igText.length}자, 해시태그 ${(igText.match(/#/g) || []).length}개) ──\n${igText}`)
console.log(`\n── 스레드 (${thText.length}자 / 최대 ${THREADS_MAX}) ──\n${thText}`)

if (thText.length > THREADS_MAX) {
  console.error(`\n❌ 스레드 본문이 ${thText.length}자로 한도(${THREADS_MAX})를 넘습니다. 줄이고 다시 실행하세요.`)
  process.exit(1)
}
if (images.length > 10) {
  console.error(`\n❌ 캐러셀은 10장까지입니다 (현재 ${images.length}장).`)
  process.exit(1)
}

if (!DO_PUBLISH) {
  console.log('\n🔎 미리보기입니다. 실제로 올리려면 --publish --now 를 붙이세요.')
  console.log('   유튜브는 이미지 게시 API가 없어 커뮤니티 탭에 손으로 올려야 합니다.')
  process.exit(0)
}
const AT = flag('at')
if (!NOW && !AT) {
  console.error('\n❌ --now(즉시) 또는 --at "2026-08-13 19:00"(KST 예약) 중 하나를 붙이세요.')
  process.exit(1)
}
const scheduleDate = AT && AT !== true ? toUtcIso(AT) : undefined
if (scheduleDate) console.log(`\n⏰ 예약: ${AT} KST (${scheduleDate})`)

const key = loadApiKey()
console.log('\n⬆️  이미지 업로드 중...')
const urls = []
for (const f of images) {
  urls.push(await uploadImage(key, f))
  console.log(`   ${path.basename(f)} 완료`)
}

const targets = ONLY && ONLY !== true ? [String(ONLY)] : ['instagram', 'threads']
for (const platform of targets) {
  const text = platform === 'instagram' ? igText : thText
  if (!text) { console.log(`⏭  ${platform}: 본문이 없어 건너뜁니다`); continue }
  const { http, json } = await post(key, { platform, text, mediaUrls: urls, scheduleDate })
  const ok = json.status === 'success' || json.status === 'scheduled'
  console.log(`${ok ? '✅' : '❌'} ${platform} ${json.status}${json.scheduleDate ? ' ' + json.scheduleDate : ''} ${ok ? (json.id || (json.postIds || []).map((x) => x.postUrl || x.id).join(' ')) : JSON.stringify(json).slice(0, 300)}`)
}

console.log('\n📌 유튜브 커뮤니티는 손으로 올려주세요. 이미지 게시는 API가 지원하지 않습니다.')
