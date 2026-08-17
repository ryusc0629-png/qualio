#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// 이미 만들어둔 쇼츠를 SNS 4채널에 예약 게시한다.
//
//   distribute.mjs 의 --publish 는 클립을 처음부터 다시 만든다.
//   자막을 따로 구워 넣은 뒤에는 그 파일이 덮어써지므로 쓸 수 없다.
//   이 스크립트는 만들어진 mp4 를 그대로 올리기만 한다.
//
// 사용법:
//   node scripts/publish-shorts.mjs <배포팩폴더> [옵션]
//
//   --dir 자막완성        올릴 mp4 가 든 하위 폴더 (기본: 배포팩폴더 그대로)
//   --start 2026-08-18   첫 게시 날짜 (KST, 기본: 내일)
//   --hour 12            게시 시각 (KST 24시간, 기본 12시 — 롱폼 19시와 겹치지 않게)
//   --per-day 2          하루에 몇 개 (기본 2)
//   --gap 3              같은 날 여러 개일 때 몇 시간 간격 (기본 3)
//   --dry                올리지 않고 계획만 보여준다
// ─────────────────────────────────────────────────────────────
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const PLATFORMS = ['youtube', 'instagram', 'threads', 'facebook']

const argv = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--dry') flags.dry = true
  else if (a === '--dir') flags.dir = argv[++i]
  else if (a === '--start') flags.start = argv[++i]
  else if (a === '--hour') flags.hour = parseInt(argv[++i], 10)
  else if (a === '--per-day') flags.perDay = parseInt(argv[++i], 10)
  else if (a === '--gap') flags.gap = parseInt(argv[++i], 10)
  else positional.push(a)
}
const packDir = positional[0]
if (!packDir) {
  console.error('사용법: node scripts/publish-shorts.mjs <배포팩폴더> [--dry]')
  process.exit(1)
}
const clipDir = path.join(packDir, flags.dir || '자막완성')
const hour = flags.hour ?? 12
const perDay = flags.perDay ?? 2
const gap = flags.gap ?? 3

// ── .env.local 에서 키 읽기 (주석 줄은 걷어낸다 — 옛 키를 집으면 401) ──
function loadEnv(name) {
  const p = path.resolve('.env.local')
  if (!existsSync(p)) throw new Error('.env.local 을 찾을 수 없습니다 (레포 루트에서 실행하세요)')
  const body = readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n')
  const m = body.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*"?([^"\\n\\r]+)"?`, 'm'))
  if (!m) throw new Error(`.env.local 에 ${name} 가 없습니다`)
  return m[1].trim()
}

// ── 클립별 캡션·타이틀 읽기 (08_숏폼_클립추천.txt) ──
function loadClipMeta() {
  const f = path.join(packDir, '08_숏폼_클립추천.txt')
  if (!existsSync(f)) return {}
  const out = {}
  let cur = null
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const head = line.match(/\(파일:\s*(clip_\d+\.mp4)\)/)
    if (head) { cur = head[1]; out[cur] = { title: '', caption: [] }; continue }
    if (!cur) continue
    const t = line.match(/^\s*화면 타이틀:\s*(.+)$/)
    if (t) { out[cur].title = t[1].trim(); continue }
    const c = line.match(/^\s*캡션:\s*(.+)$/)
    if (c) { out[cur].caption.push(c[1].trim()); continue }
    if (/^\s*왜 뜰까:/.test(line)) { cur = null; continue }
    if (out[cur].caption.length && line.trim()) out[cur].caption.push(line.trim())
  }
  for (const k of Object.keys(out)) out[k].caption = out[k].caption.join('\n')
  return out
}

function loadHashtags() {
  const f = path.join(packDir, '07_숏폼캡션.txt')
  if (!existsSync(f)) return ''
  const tags = readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim().startsWith('#'))
  // 인스타는 해시태그 10개 초과 시 전 채널 게시가 거부된다
  const list = (tags.join(' ').match(/#[^\s#]+/g) || []).slice(0, 9)
  return [...new Set([...list, '#Shorts'])].join(' ')
}

// KST 기준 예약 시각 → UTC ISO
function scheduleAt(idx) {
  const base = flags.start ? new Date(`${flags.start}T00:00:00+09:00`)
    : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d })()
  const day = Math.floor(idx / perDay)
  const slot = idx % perDay
  const kst = new Date(base)
  kst.setDate(kst.getDate() + day)
  kst.setHours(hour + slot * gap, 0, 0, 0)
  return kst
}

async function ayrshareUpload(apiKey, filePath) {
  const fd = new FormData()
  // ⚠ 타입을 안 주면 octet-stream 으로 올라가 '이미지'로 인식되고 8MB 한도에 걸린다
  fd.append('file', new Blob([readFileSync(filePath)], { type: 'video/mp4' }), path.basename(filePath))
  const r = await fetch('https://api.ayrshare.com/api/media/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`미디어 업로드 실패: ${JSON.stringify(j).slice(0, 300)}`)
  return j.accessUrl || j.url
}

async function ayrsharePost(apiKey, { text, mediaUrl, title, scheduleDate }) {
  const body = { post: text, platforms: PLATFORMS, mediaUrls: [mediaUrl], scheduleDate,
                 youTubeOptions: { title: title.slice(0, 95), visibility: 'public' } }
  const r = await fetch('https://api.ayrshare.com/api/post', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 400))
  return j
}

const clips = readdirSync(clipDir).filter((f) => /^clip_\d+\.mp4$/.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))
if (!clips.length) { console.error(`쇼츠가 없습니다: ${clipDir}`); process.exit(1) }

const meta = loadClipMeta()
const tags = loadHashtags()

console.log(`쇼츠 ${clips.length}개 · ${PLATFORMS.join(', ')}`)
console.log(`하루 ${perDay}개 · ${hour}시부터 ${gap}시간 간격 (KST)\n`)

const plan = clips.map((f, i) => ({ file: f, when: scheduleAt(i), m: meta[f] || {} }))
for (const p of plan) {
  const t = p.when
  console.log(`  ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}시  ${p.file}  ${(p.m.title || '').slice(0, 34)}`)
}

if (flags.dry) { console.log('\n(계획만 — 실제로 올리지 않았습니다)'); process.exit(0) }

const apiKey = loadEnv('AYRSHARE_API_KEY')
console.log('')
let ok = 0
for (const p of plan) {
  const full = path.join(clipDir, p.file)
  try {
    const url = await ayrshareUpload(apiKey, full)
    const text = `${p.m.caption || p.m.title || ''}\n\n${tags}`.trim()
    await ayrsharePost(apiKey, {
      text, mediaUrl: url, title: p.m.title || p.file,
      scheduleDate: p.when.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    })
    const t = p.when
    console.log(`  예약 완료  ${p.file}  → ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}시`)
    ok++
  } catch (e) {
    console.log(`  실패  ${p.file}  ${String(e.message).slice(0, 200)}`)
  }
}
console.log(`\n${ok}/${plan.length}개 예약됨`)
