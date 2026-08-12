#!/usr/bin/env node
// 이미 예약된 배포팩을 "즉시 게시"로 재처리
// 1) 예약된 Ayrshare 포스트 삭제(중복 방지) 2) 기존 클립을 그대로 즉시 재업로드·게시
// 사용법: node scripts/republish_now.mjs --ep 15 --ids id1,id2,...
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
const flags = {}
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--ep') flags.ep = argv[++i]
  else if (argv[i] === '--ids') flags.ids = argv[++i]
  else if (argv[i] === '--from') flags.from = parseInt(argv[++i], 10) // 이 클립 번호부터 재개(한도 걸려 중단된 뒤 이어하기)
  else if (argv[i] === '--to') flags.to = parseInt(argv[++i], 10)
}
const ep = flags.ep || '0'
const scheduledIds = (flags.ids || '').split(',').map(s => s.trim()).filter(Boolean)

const PLATFORMS = ['youtube', 'instagram', 'threads', 'facebook']

function loadEnv(name) {
  const m = readFileSync(path.resolve('.env.local'), 'utf8').match(new RegExp(`${name}\\s*=\\s*"?([^"\\n\\r]+)"?`))
  if (!m) throw new Error(`.env.local 에 ${name} 없음`)
  return m[1].trim()
}

// 08_숏폼_클립추천.txt 파싱 → [{title, caption}]
function parseClips(dir) {
  const raw = readFileSync(path.join(dir, '08_숏폼_클립추천.txt'), 'utf8')
  const blocks = raw.split(/\n\s*\n(?=#\d)/).map(b => b.trim()).filter(Boolean)
  return blocks.map(b => {
    const lines = b.split('\n')
    const title = (lines.find(l => l.includes('화면 타이틀:')) || '').split('화면 타이틀:')[1]?.trim() || ''
    const capIdx = lines.findIndex(l => l.includes('캡션:'))
    const whyIdx = lines.findIndex(l => l.includes('왜 뜰까:'))
    const capLines = lines.slice(capIdx, whyIdx < 0 ? undefined : whyIdx)
    let caption = capLines.join('\n').replace(/^\s*캡션:\s*/, '').trim()
    return { title, caption }
  })
}

// 해시태그 라인(#으로 시작) 추출
function parseHashtags(dir) {
  const raw = readFileSync(path.join(dir, '07_숏폼캡션.txt'), 'utf8')
  return raw.split('\n').find(l => l.trim().startsWith('#')) || ''
}

function capHashtags(raw, extra = '', max = 10) {
  const tags = `${raw || ''} ${extra}`.split(/\s+/).filter(t => t.startsWith('#'))
  const seen = new Set(); const uniq = []
  for (const t of tags) { const k = t.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(t) } }
  return uniq.slice(0, max).join(' ')
}

async function deletePost(apiKey, id) {
  const r = await fetch('https://api.ayrshare.com/api/post', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, j }
}

async function upload(apiKey, filePath) {
  const fd = new FormData()
  fd.append('file', new Blob([readFileSync(filePath)], { type: 'video/mp4' }), path.basename(filePath))
  fd.append('fileName', path.basename(filePath))
  const r = await fetch('https://api.ayrshare.com/api/media/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.url) throw new Error(`업로드 실패(${r.status}): ${JSON.stringify(j).slice(0, 200)}`)
  return j.url
}

async function postNow(apiKey, { text, mediaUrl, title }) {
  const body = {
    post: text, platforms: PLATFORMS, mediaUrls: [mediaUrl], isVideo: true,
    youTubeOptions: { title: (title || '').slice(0, 95) || '청소 창업 챌린지', visibility: 'public' },
  }
  const r = await fetch('https://api.ayrshare.com/api/post', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json().catch(() => ({ status: 'error', http: r.status }))
}

;(async () => {
  const apiKey = loadEnv('AYRSHARE_API_KEY')
  const dir = path.join(homedir(), 'Downloads', `배포팩_EP${ep}`)
  if (!existsSync(dir)) throw new Error(`배포팩 폴더 없음: ${dir}`)

  // 1) 예약 삭제
  if (scheduledIds.length) {
    console.log(`🗑  예약 포스트 삭제 중... (${scheduledIds.length}건)`)
    for (const id of scheduledIds) {
      const { ok, status, j } = await deletePost(apiKey, id)
      console.log(`   ${id}: ${ok ? '삭제됨' : `실패(${status}) ${JSON.stringify(j).slice(0, 120)}`}`)
    }
  }

  // 2) 즉시 재게시
  const clips = parseClips(dir)
  const hashtags = parseHashtags(dir)
  const from = flags.from || 1
  const to = flags.to || clips.length
  console.log(`\n📤 즉시 게시 중... (${PLATFORMS.join(', ')}) — 클립 #${from}~#${to} / 총 ${clips.length}개`)

  // 채널별 성공·실패 집계 — 40개씩 물량 배포하면 중간부터 일일 업로드 한도에 걸릴 수 있어
  // "몇 번부터 어느 채널이 막혔는지"가 눈에 보여야 이어하기(--from)로 복구할 수 있다.
  const tally = {}
  const bump = (p, ok) => { tally[p] = tally[p] || { ok: 0, fail: 0 }; tally[p][ok ? 'ok' : 'fail']++ }
  const failed = []

  for (let i = from - 1; i < to; i++) {
    const mp4 = path.join(dir, `clip_${i + 1}.mp4`)
    if (!existsSync(mp4)) { console.log(`  #${i + 1} 파일 없음, 건너뜀`); continue }
    const text = `${clips[i].caption || ''}\n\n${capHashtags(hashtags, '#Shorts')}`.trim()
    let posted = false
    for (let attempt = 1; attempt <= 2 && !posted; attempt++) {
      try {
        const url = await upload(apiKey, mp4)
        const res = await postNow(apiKey, { text, mediaUrl: url, title: clips[i].title })
        const errs = res.errors || []
        const okPlatforms = (res.postIds || []).map(p => p.platform)
        for (const p of okPlatforms) bump(p, true)
        for (const e of errs) bump(e.platform || '?', false)
        const errTxt = errs.length ? ` ⚠️${errs.map(e => `${e.platform}:${(e.message || e.code || '').toString().slice(0, 60)}`).join(' / ')}` : ''
        console.log(`  #${i + 1} ${res.status || '?'} ${res.id || ''} [성공:${okPlatforms.join(',') || '없음'}]${errTxt}`)
        if (res.status === 'error' && !okPlatforms.length && attempt === 1) { await new Promise(r => setTimeout(r, 4000)); continue }
        posted = true
        if (!okPlatforms.length) failed.push(i + 1)
      } catch (e) {
        console.log(`  #${i + 1} 시도${attempt} 실패: ${e.message}`)
        if (attempt === 2) failed.push(i + 1)
        else await new Promise(r => setTimeout(r, 4000))
      }
    }
  }

  console.log('\n📊 채널별 결과')
  for (const [p, v] of Object.entries(tally)) console.log(`   ${p}: 성공 ${v.ok} / 실패 ${v.fail}`)
  if (failed.length) console.log(`\n⚠️  전 채널 실패한 클립: ${failed.join(', ')} — 이어하기: node scripts/republish_now.mjs --ep ${ep} --from <번호>`)
  console.log('\n✅ 즉시 배포 완료')
})().catch(e => { console.error(`❌ ${e.message}`); process.exit(1) })
