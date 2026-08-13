#!/usr/bin/env node
/**
 * 캐러셀 폴더들의 캡션.txt 에서 "네이버 카페"·"유튜브" 원고만 뽑아 노션에 올린다.
 *
 * 인스타·스레드는 API로 자동 게시되지만 네이버 카페와 유튜브 커뮤니티는 API가 없어
 * 손으로 올려야 한다. 그 원고를 노션 한 페이지에 모아두는 용도.
 *
 * 본문은 코드블록(plain text)으로 넣는다. 서식 블록으로 넣으면 네이버 편집기에
 * 붙여넣을 때 줄바꿈이 뭉개진다. (distribute.mjs 와 같은 이유)
 *
 * 사용법
 *   node scripts/push-cafe-drafts.mjs --title "OPS 2.0 SNS 초안" \
 *     --dir "8/13|~/Downloads/OPS-수강생후기-SNS" --dir "8/14|~/.../post2"
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const NOTION_PARENT = '3a8a926a-bb65-818d-9adb-f35a4fca0d4b' // 노션 "📝 네이버 초안(자동 생성)" 페이지
const argv = process.argv.slice(2)

const dirs = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dir') dirs.push(String(argv[i + 1] || ''))
}
const tIdx = argv.indexOf('--title')
const pageTitle = tIdx >= 0 ? argv[tIdx + 1] : '카페 초안'
if (!dirs.length) { console.error('--dir "라벨|경로" 를 하나 이상 주세요'); process.exit(1) }

function loadToken() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN
  const p = path.resolve(process.cwd(), '.env.local')
  const m = existsSync(p) && readFileSync(p, 'utf8').match(/^NOTION_TOKEN=(.*)$/m)
  if (!m) throw new Error('.env.local 에 NOTION_TOKEN 이 없습니다')
  return m[1].trim()
}

// ──── 로 감싼 제목 줄만 구획으로 인정 (본문 속 "네이버 카페 …" 문장 오인 방지)
function readSections(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const isDiv = (s) => /^[─=]{5,}$/.test((s || '').trim())
  const out = {}
  let cur = null; let buf = []
  const flush = () => { if (cur) out[cur] = (out[cur] ? out[cur] + '\n' : '') + buf.join('\n').trim(); buf = [] }
  for (let i = 0; i < lines.length; i++) {
    if (isDiv(lines[i]) && isDiv(lines[i + 2])) {
      const head = (lines[i + 1] || '').trim()
      flush()
      cur = /카페/.test(head) ? 'cafe' : /유튜브/.test(head) ? 'youtube' : null
      i += 2
      continue
    }
    if (isDiv(lines[i])) continue
    if (cur) buf.push(lines[i])
  }
  flush()
  return out
}

const nH3 = (t) => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: t } }] } })
const nP = (t) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: t } }] } })
function nCode(content) {
  const s = String(content || ' ')
  const chunks = []
  for (let i = 0; i < s.length; i += 1900) chunks.push(s.slice(i, i + 1900))
  if (!chunks.length) chunks.push(' ')
  return { object: 'block', type: 'code', code: { language: 'plain text', rich_text: chunks.map((c) => ({ type: 'text', text: { content: c } })) } }
}

const children = [
  nP('인스타·스레드는 예약 발행되어 있습니다. 아래는 API가 없어 손으로 올려야 하는 원고입니다.'),
  nP('본문은 코드블록 오른쪽 위 복사 버튼을 누르면 줄바꿈 그대로 복사됩니다.'),
]

for (const spec of dirs) {
  const [label, rawDir] = spec.includes('|') ? spec.split('|') : ['', spec]
  const dir = rawDir.replace(/^~/, os.homedir())
  const file = path.join(dir, '캡션.txt')
  if (!existsSync(file)) { console.log(`⏭  ${file} 없음`); continue }
  const s = readSections(file)
  const name = path.basename(dir)
  if (s.cafe) {
    children.push(nH3(`${label ? label + ' · ' : ''}네이버 카페 청소업의 모든 것 (${name})`))
    children.push(nCode(s.cafe))
  }
  if (s.youtube) {
    children.push(nH3(`${label ? label + ' · ' : ''}유튜브 커뮤니티 (${name})`))
    children.push(nCode(s.youtube))
  }
  console.log(`📄 ${name}: 카페 ${s.cafe ? '있음' : '없음'} · 유튜브 ${s.youtube ? '있음' : '없음'}`)
}

const tok = loadToken()
const H = { Authorization: `Bearer ${tok}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }
const r = await fetch('https://api.notion.com/v1/pages', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    parent: { page_id: NOTION_PARENT },
    icon: { type: 'emoji', emoji: '📝' },
    properties: { title: { title: [{ text: { content: pageTitle } }] } },
    children: children.slice(0, 100),
  }),
})
const j = await r.json()
if (r.status !== 200) { console.error(`❌ 노션 실패 ${r.status}: ${JSON.stringify(j).slice(0, 300)}`); process.exit(1) }
for (let i = 100; i < children.length; i += 100) {
  await fetch(`https://api.notion.com/v1/blocks/${j.id}/children`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ children: children.slice(i, i + 100) }),
  })
}
console.log(`\n📝 노션 업로드 완료: ${j.url}`)
