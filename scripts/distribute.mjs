#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// 콘텐츠 재가공·배포 자동화 파이프라인 (퀄리오 본사용)
// 영상 1개 → 자막 → Claude 재가공 → 채널별 초안 + 하이라이트 클립추천
//
// 사용법:
//   node scripts/distribute.mjs "<영상경로>" --ep 4 [--clips] [--srt <경로>]
//   node scripts/distribute.mjs --srt /tmp/4ilcha_out/4ilcha.srt --ep 4   (자막 재사용)
//
// 산출물: ~/Downloads/배포팩_EP<ep>/ 아래 채널별 .txt + 배포팩.md(노션 붙여넣기용)
// ─────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

const YT_LINK = 'https://youtu.be/xa9yOE0ERr0' // 1일차부터 보기(시리즈 시작점)
const NOTION_DRAFTS_PARENT = '3a8a926a-bb65-818d-9adb-f35a4fca0d4b' // 노션 "📝 네이버 초안(자동 생성)" 페이지
const MODEL = 'claude-sonnet-4-6'
const WHISPER_MODEL = 'mlx-community/whisper-large-v3-turbo'

// ── 0. 인자 파싱 ──────────────────────────────────────────────
const argv = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--clips') flags.clips = true
  else if (a === '--burn') { flags.clips = true; flags.burn = true } // 자막 번인(자동 컷 포함)
  else if (a === '--vertical') { flags.clips = true; flags.vertical = true } // 9:16 세로 쇼츠(블러 배경)
  else if (a === '--publish') { flags.clips = true; flags.vertical = true; flags.publish = true } // Ayrshare 자동 게시·예약
  else if (a === '--now') flags.now = true // 예약 대신 즉시 게시
  else if (a === '--analytics') flags.analytics = true // 채널 성과 리포트(영상 불필요)
  else if (a === '--ep') flags.ep = argv[++i]
  else if (a === '--srt') flags.srt = argv[++i]
  else positional.push(a)
}
const videoPath = positional[0] || null
const ep = flags.ep || '0'
if (!videoPath && !flags.srt && !flags.analytics) {
  console.error('사용법: node scripts/distribute.mjs "<영상경로>" --ep 4 [--vertical] [--publish] [--now]')
  console.error('  성과 리포트: node scripts/distribute.mjs --analytics')
  process.exit(1)
}

// ── 1. .env.local에서 환경변수 로드 ──────────────────────────
function loadEnv(name, hint) {
  const envPath = path.resolve('.env.local')
  if (!existsSync(envPath)) throw new Error('.env.local 을 찾을 수 없습니다 (레포 루트에서 실행하세요)')
  const m = readFileSync(envPath, 'utf8').match(new RegExp(`${name}\\s*=\\s*"?([^"\\n\\r]+)"?`))
  if (!m) throw new Error(`.env.local 에 ${name} 가 없습니다${hint ? ` — ${hint}` : ''}`)
  return m[1].trim()
}

// ── 2. 자막 추출 (ffmpeg → mlx_whisper) ──────────────────────
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) throw new Error(`실패: ${cmd} ${args.join(' ')}`)
}

function transcribe(video) {
  const tmpWav = `/tmp/distribute_ep${ep}.wav`
  const outDir = `/tmp/distribute_ep${ep}_out`
  mkdirSync(outDir, { recursive: true })
  console.log('🎧 음성 추출 중...')
  sh('ffmpeg', ['-y', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', tmpWav], { stdio: 'ignore' })
  console.log('📝 자막 변환 중 (whisper)...')
  const whisperBin = path.join(homedir(), 'Library/Python/3.14/bin')
  sh('mlx_whisper', [tmpWav, '--model', WHISPER_MODEL, '--language', 'ko', '--output-format', 'srt', '--output-dir', outDir, '--verbose', 'False'],
    { env: { ...process.env, PATH: `${whisperBin}:${process.env.PATH}` }, stdio: 'ignore' })
  const srt = path.join(outDir, `distribute_ep${ep}.srt`)
  if (!existsSync(srt)) throw new Error('자막 파일 생성 실패')
  return srt
}

// ── 3. SRT 파싱 → 타임스탬프 텍스트 ──────────────────────────
function parseSrt(srtPath) {
  const raw = readFileSync(srtPath, 'utf8')
  const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  const lines = []
  let plain = ''
  for (const b of blocks) {
    const l = b.split('\n')
    const time = l.find(x => x.includes('-->'))
    if (!time) continue
    const start = time.split('-->')[0].trim().slice(0, 8) // HH:MM:SS
    const text = l.slice(l.indexOf(time) + 1).join(' ').trim()
    if (!text) continue
    lines.push(`[${start}] ${text}`)
    plain += text + '\n'
  }
  return { stamped: lines.join('\n'), plain }
}

// ── 4. Claude 재가공 (JSON 강제) ─────────────────────────────
const SYSTEM = `너는 '청소 창업 90일 챌린지' 유튜브 영상을 다채널로 재가공하는 한국어 카피라이터다. 규칙을 반드시 지켜라.

[공통]
- 모든 글은 '입니다' 어체.
- 사용자 노출 문구에 "AI" 단어 금지(우리 서비스를 가리킬 때). 대신 "전문가 데이터/자동" 톤. (ChatGPT 등 외부 AI검색 플랫폼 지칭은 예외로 허용)
- 업체명·상업 링크 넣지 말 것. 유튜브 링크는 반드시 ${YT_LINK} 사용(문구는 "1일차부터 보기").
- 자막에 없는 매출·성과·수치를 지어내지 말 것. 사실만.
- "광고 0원 / 광고비 0원 / 광고 없이" 같은 표현 금지 — 검색광고는 유지하므로 오해 소지. 대신 "퍼포먼스 광고 대신 영업으로" 식으로.

[채널별 톤]
- blog(네이버 블로그): 소비자 눈높이 SEO 장문(1200자+). 핵심 키워드 "청소 창업"을 제목·첫문단·소제목에 자연스럽게 반복. 소제목(##) 목차형.
- cafe.afup(아프니까 사장이다): 전 업종 자영업자 대상 대중 핏. 솔직/실수 후크로 공감. "청소 창업" 키워드 노출.
- cafe.all(청소업의 모든 것): 동종 업계. 권위 있되 겸손("정답이라 생각 안 합니다 / 배우겠습니다").
- cafe.dongwoo(청소동우회): 고인물 견제 주의. "저는 청소 서비스가 메인이 아니라 청소업체용 운영 자동화 툴을 만드는 사람"이라는 포지션으로 결과·과정을 공유하며 자연 노출. 아직 매출 전이면 자랑 대신 '포지션 심기' 톤.
- threads/x: build-in-public 짧은 텍스트. 대화 유도 질문으로 마무리.
- shorts_caption(쇼츠·릴스·틱톡 공용): 첫 1초 훅 + 3~4줄. hashtags는 별도 필드에.
- clips: 물량 전략. 독립적으로 이해되는(맥락 없이 봐도 되는) 훅 강한 구간 5~8개를 고른다. 각 15~45초, 자막 타임스탬프 기준. 정보전달보다 '스크롤 멈추게 하는' 순간(궁금증·숫자·반전·실수·감정) 우선. 훅 강한 순서로 정렬. 각 clip마다:
  · title: 화면에 박을 초대형 훅 한 줄(짧게, 궁금증/숫자/반전)
  · caption: 게시글 본문 3~4줄
  · reason: 왜 이 구간이 반응 날지 한 줄(근거)

반드시 emit_content 툴을 호출해 결과를 넘긴다.`

// 구조화 출력 스키마 (툴 호출로 강제 → JSON 파싱 실패 원천 차단)
const TB = { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] }
const OUTPUT_TOOL = {
  name: 'emit_content',
  description: '채널별 재가공 결과를 넘긴다',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      blog: TB,
      cafe: { type: 'object', properties: { afup: TB, all: TB, dongwoo: TB }, required: ['afup', 'all', 'dongwoo'] },
      threads: { type: 'string' },
      x: { type: 'string' },
      shorts_caption: { type: 'string' },
      hashtags: { type: 'string' },
      clips: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            start: { type: 'string' }, end: { type: 'string' },
            title: { type: 'string' }, caption: { type: 'string' }, reason: { type: 'string' },
          },
          required: ['start', 'end', 'title', 'caption', 'reason'],
        },
      },
    },
    required: ['summary', 'blog', 'cafe', 'threads', 'x', 'shorts_caption', 'hashtags', 'clips'],
  },
}

async function generate(apiKey, stamped) {
  console.log('🤖 채널별 초안 생성 중 (Claude)...')
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    tools: [OUTPUT_TOOL],
    tool_choice: { type: 'tool', name: 'emit_content' },
    messages: [{ role: 'user', content: `에피소드 번호: EP.${ep}\n\n[자막 (타임스탬프 포함)]\n${stamped}` }],
  })
  const tool = msg.content.find(b => b.type === 'tool_use')
  if (!tool) throw new Error('구조화 출력(tool_use)이 없습니다')
  return tool.input
}

// ── 5. 파일 출력 ─────────────────────────────────────────────
function hms2sec(t) {
  const p = t.split(':').map(Number)
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
}

// SRT 파싱/재계산 (클립별 자막 .srt 생성용)
function srtToMs(t) {
  const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  return m ? (+m[1]) * 3600000 + (+m[2]) * 60000 + (+m[3]) * 1000 + (+m[4]) : 0
}
function msToSrt(ms) {
  const p = (n, l = 2) => String(n).padStart(l, '0')
  const h = Math.floor(ms / 3600000); ms %= 3600000
  const m = Math.floor(ms / 60000); ms %= 60000
  const s = Math.floor(ms / 1000)
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`
}
function srtEntries(srtPath) {
  const blocks = readFileSync(srtPath, 'utf8').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  const out = []
  for (const b of blocks) {
    const l = b.split('\n')
    const t = l.find(x => x.includes('-->'))
    if (!t) continue
    const [a, c] = t.split('-->').map(s => s.trim())
    out.push({ start: srtToMs(a), end: srtToMs(c), text: l.slice(l.indexOf(t) + 1).join('\n') })
  }
  return out
}
// 클립 구간(초)에 걸치는 자막만 골라 0 기준으로 재계산한 SRT 문자열
function buildClipSrt(entries, startSec, endSec) {
  const s0 = startSec * 1000, e0 = endSec * 1000
  let idx = 1
  const lines = []
  for (const e of entries) {
    if (e.end <= s0 || e.start >= e0) continue
    const st = Math.max(0, e.start - s0), en = Math.min(e.end, e0) - s0
    lines.push(`${idx++}\n${msToSrt(st)} --> ${msToSrt(en)}\n${e.text}`)
  }
  return lines.join('\n\n') + '\n'
}
// 이 ffmpeg에 subtitles(libass) 필터가 있는지
function ffHasSubtitles() {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
  return / subtitles /.test(r.stdout || '')
}

function writeOutputs(data, srtPath, video) {
  const outDir = path.join(homedir(), 'Downloads', `배포팩_EP${ep}`)
  mkdirSync(outDir, { recursive: true })
  const w = (name, content) => writeFileSync(path.join(outDir, name), content, 'utf8')
  const block = (t, b) => `[제목]\n${t}\n\n[본문]\n${b}\n`

  w('00_요약.txt', data.summary || '')
  w('01_네이버블로그.txt', block(data.blog?.title, data.blog?.body))
  w('02_카페_아프니까사장이다.txt', block(data.cafe?.afup?.title, data.cafe?.afup?.body))
  w('03_카페_청소업의모든것.txt', block(data.cafe?.all?.title, data.cafe?.all?.body))
  w('04_카페_청소동우회.txt', block(data.cafe?.dongwoo?.title, data.cafe?.dongwoo?.body))
  w('05_스레드.txt', data.threads || '')
  w('06_X.txt', data.x || '')
  w('07_숏폼캡션.txt', `${data.shorts_caption || ''}\n\n${data.hashtags || ''}`)
  w('08_숏폼_클립추천.txt', (data.clips || []).map((c, i) =>
    `#${i + 1}  ${c.start} ~ ${c.end}   (파일: clip_${i + 1}.mp4)\n` +
    `  화면 타이틀: ${c.title}\n` +
    `  캡션: ${c.caption}\n` +
    `  왜 뜰까: ${c.reason}`).join('\n\n'))
  copyFileSync(srtPath, path.join(outDir, '자막.srt'))

  // 노션 붙여넣기용 통합 마크다운
  const md = [
    `# EP.${ep} 배포팩`, '',
    `> ${data.summary || ''}`, '',
    '## 네이버 블로그', `### ${data.blog?.title || ''}`, '', data.blog?.body || '', '',
    '## 카페 — 아프니까 사장이다', `**${data.cafe?.afup?.title || ''}**`, '', data.cafe?.afup?.body || '', '',
    '## 카페 — 청소업의 모든 것', `**${data.cafe?.all?.title || ''}**`, '', data.cafe?.all?.body || '', '',
    '## 카페 — 청소동우회', `**${data.cafe?.dongwoo?.title || ''}**`, '', data.cafe?.dongwoo?.body || '', '',
    '## 스레드', data.threads || '', '',
    '## X', data.x || '', '',
    '## 숏폼 캡션 (쇼츠·릴스·틱톡)', data.shorts_caption || '', '', data.hashtags || '', '',
    '## 숏폼 클립 추천', ...(data.clips || []).map((c, i) => `- **#${i + 1} ${c.start}~${c.end}** — ${c.title}\n  - 캡션: ${c.caption}\n  - 왜 뜰까: ${c.reason}`),
  ].join('\n')
  w('배포팩.md', md)

  // 하이라이트 클립 컷 (옵션) — 원본 비율 컷 + 구간 자막 .srt 동봉
  // --burn: libass 있으면 자막 번인, 없으면 컷+.srt만(캡션은 CapCut 자동자막 권장)
  if (flags.clips && video && existsSync(video)) {
    const entries = srtEntries(srtPath)
    const burn = flags.burn && ffHasSubtitles()
    if (flags.burn && !burn) {
      console.log('⚠️  이 ffmpeg엔 subtitles(libass) 필터가 없어 자막 번인은 건너뜁니다.')
      console.log('    → 컷 + 클립별 .srt만 생성. 캡션은 CapCut 자동자막 또는 .srt import 권장.')
    }
    const mode = flags.vertical ? '9:16 세로 쇼츠 변환' : burn ? '클립 컷 + 자막 번인' : '하이라이트 클립 컷'
    console.log(`✂️  ${mode} 중...`)
    ;(data.clips || []).forEach((c, i) => {
      const out = path.join(outDir, `clip_${i + 1}.mp4`)
      const ss = hms2sec(c.start), to = hms2sec(c.end)
      const clipSrt = buildClipSrt(entries, ss, to)
      writeFileSync(path.join(outDir, `clip_${i + 1}.srt`), clipSrt, 'utf8') // 편집기용 동봉
      const args = ['-y', '-ss', String(ss), '-to', String(to), '-i', video]
      if (flags.vertical) {
        // 상단 후킹 제목을 투명 PNG로 렌더(PIL) → 있으면 overlay로 얹음(CTR↑)
        let titlePng = null
        if (c.title) {
          titlePng = `/tmp/_title_${ep}_${i + 1}.png`
          const r = spawnSync('python3', [path.resolve('scripts/render_title.py'), c.title, titlePng], { stdio: 'ignore' })
          if (r.status !== 0 || !existsSync(titlePng)) titlePng = null
        }
        // 가로 원본을 9:16 캔버스 가운데 배치 + 블러 배경(화면녹화라 크롭 대신 여백채움)
        const vbase =
          '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=20[bg];' +
          '[0:v]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2'
        if (titlePng) {
          args.push('-i', titlePng, '-filter_complex', `${vbase}[base];[base][1:v]overlay=(W-w)/2:300[v]`, '-map', '[v]', '-map', '0:a?')
        } else {
          args.push('-filter_complex', vbase)
        }
      } else if (burn) {
        const tmp = `/tmp/_clip_${ep}_${i + 1}.srt` // 한글 경로 회피(필터 파싱 안전)
        writeFileSync(tmp, clipSrt, 'utf8')
        args.push('-vf', `subtitles=${tmp}:force_style='FontName=Apple SD Gothic Neo,FontSize=16,Outline=1,Shadow=0,MarginV=40'`)
      }
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', out)
      spawnSync('ffmpeg', args, { stdio: 'ignore' })
    })
  }
  return outDir
}

// ── 6. Ayrshare 자동 게시·예약 (--publish) ───────────────────
const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'threads', 'facebook'] // 연결된 5채널(X는 BYOK 미연결·네이버는 API 없음)

// 인스타그램은 해시태그 최대 10개(초과 시 code 151로 전 채널 게시 거부) → 중복 제거 후 상위 N개만(외부 태그 extra 포함)
function capHashtags(raw, extra = '', max = 10) {
  const tags = `${raw || ''} ${extra}`.split(/\s+/).filter((t) => t.startsWith('#'))
  const seen = new Set()
  const uniq = []
  for (const t of tags) {
    const k = t.toLowerCase()
    if (!seen.has(k)) { seen.add(k); uniq.push(t) }
  }
  return uniq.slice(0, max).join(' ')
}

// 내일부터 하루 1개씩, 19:00 KST(=10:00 UTC)에 분산 예약
function scheduleUtc(i) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1 + i)
  d.setUTCHours(10, 0, 0, 0)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// 로컬 mp4 → Ayrshare 미디어 업로드(멀티파트, <30MB) → 공개 URL
async function ayrshareUpload(apiKey, filePath) {
  const fd = new FormData()
  fd.append('file', new Blob([readFileSync(filePath)], { type: 'video/mp4' }), path.basename(filePath))
  fd.append('fileName', path.basename(filePath))
  const r = await fetch('https://api.ayrshare.com/api/media/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.url) throw new Error(`미디어 업로드 실패(${r.status}): ${JSON.stringify(j).slice(0, 200)}`)
  return j.url
}

// 게시/예약 (video → YouTube 쇼츠·IG 릴스·틱톡·스레드·X)
async function ayrsharePost(apiKey, { text, mediaUrl, title, scheduleDate }) {
  const body = {
    post: text,
    platforms: PLATFORMS,
    mediaUrls: [mediaUrl],
    isVideo: true,
    youTubeOptions: { title: (title || '').slice(0, 95) || '청소 창업 챌린지', visibility: 'public' },
  }
  if (scheduleDate) body.scheduleDate = scheduleDate
  const r = await fetch('https://api.ayrshare.com/api/post', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json().catch(() => ({ status: 'error', http: r.status }))
}

async function publishClips(data, outDir) {
  const apiKey = loadEnv('AYRSHARE_API_KEY', 'ayrshare.com 가입→계정연결→API키 발급 후 .env.local에 추가')
  const clips = data.clips || []
  console.log(`📤 Ayrshare 업로드·${flags.now ? '즉시 게시' : '예약'} 중... (${PLATFORMS.join(', ')})`)
  for (let i = 0; i < clips.length; i++) {
    const mp4 = path.join(outDir, `clip_${i + 1}.mp4`)
    if (!existsSync(mp4)) continue
    const text = `${clips[i].caption || ''}\n\n${capHashtags(data.hashtags, '#Shorts')}`.trim()
    try {
      const url = await ayrshareUpload(apiKey, mp4)
      const res = await ayrsharePost(apiKey, {
        text, mediaUrl: url, title: clips[i].title,
        scheduleDate: flags.now ? null : scheduleUtc(i),
      })
      const when = flags.now ? '' : ` @${scheduleUtc(i)}`
      const errs = (res.errors && res.errors.length) ? ` ⚠️${JSON.stringify(res.errors).slice(0, 150)}` : ''
      console.log(`  #${i + 1} ${res.status || '?'}${when} ${res.id || ''}${errs}`)
    } catch (e) {
      console.log(`  #${i + 1} 실패: ${e.message}`)
    }
  }
}

// ── 7. 채널 성과 리포트 (--analytics) ────────────────────────
async function runAnalytics() {
  const key = loadEnv('AYRSHARE_API_KEY', 'Ayrshare Premium 필요')
  console.log('📊 채널 성과 조회 중...')
  const r = await fetch('https://api.ayrshare.com/api/analytics/social', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platforms: PLATFORMS }),
  })
  const j = await r.json()
  if (!r.ok) { console.log('실패', r.status, JSON.stringify(j).slice(0, 200)); return }
  // 채널별 핵심 지표(숫자형)만 요약 출력
  const pick = { youtube: ['subscriberCount', 'viewCount', 'likes', 'comments', 'estimatedMinutesWatched', 'averageViewDuration'],
    instagram: ['followersCount', 'followsCount', 'mediaCount'], facebook: ['followersCount', 'fanCount'],
    tiktok: ['followerCount', 'followingCount', 'likesCount', 'videoCount'], threads: ['followersCount'] }
  for (const p of PLATFORMS) {
    const a = j[p]?.analytics
    console.log(`\n[${p}]${a ? '' : ' 데이터 없음'}`)
    if (!a) continue
    const keys = (pick[p] || []).filter(k => typeof a[k] === 'number')
    const show = keys.length ? keys : Object.keys(a).filter(k => typeof a[k] === 'number').slice(0, 8)
    for (const k of show) console.log(`   ${k}: ${a[k].toLocaleString()}`)
  }
  const out = path.join(homedir(), 'Downloads', '성과리포트.json')
  writeFileSync(out, JSON.stringify(j, null, 2))
  console.log(`\n💾 전체 데이터 저장: ${out}`)
}

// ── 8. 네이버 초안 → 노션 자동 푸시 (NOTION_TOKEN 있을 때) ────
function nHeading(t) { return { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: t } }] } } }
function nCode(text) { // 노션 rich_text는 항목당 2000자 제한 → 분할
  const chunks = []
  for (let i = 0; i < text.length; i += 1900) chunks.push(text.slice(i, i + 1900))
  return { object: 'block', type: 'code', code: { language: 'plain text', rich_text: chunks.map(c => ({ type: 'text', text: { content: c } })) } }
}
async function pushToNotion(outDir) {
  let tok
  try { tok = loadEnv('NOTION_TOKEN') } catch { return } // 토큰 없으면 조용히 스킵
  const files = [
    ['네이버 블로그', '01_네이버블로그.txt'],
    ['카페 — 아프니까 사장이다', '02_카페_아프니까사장이다.txt'],
    ['카페 — 청소업의 모든 것', '03_카페_청소업의모든것.txt'],
    ['카페 — 청소동우회', '04_카페_청소동우회.txt'],
  ]
  const children = []
  for (const [h, f] of files) {
    const p = path.join(outDir, f)
    if (existsSync(p)) children.push(nHeading(h), nCode(readFileSync(p, 'utf8')))
  }
  if (!children.length) return
  const body = {
    parent: { page_id: NOTION_DRAFTS_PARENT },
    icon: { type: 'emoji', emoji: '📝' },
    properties: { title: { title: [{ text: { content: `EP.${ep} 네이버 초안` } }] } },
    children,
  }
  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  console.log(r.status === 200 ? `📝 네이버 초안 → 노션: ${j.url}` : `⚠️ 노션 푸시 실패: ${r.status} ${JSON.stringify(j).slice(0, 120)}`)
}

// ── 실행 ─────────────────────────────────────────────────────
;(async () => {
  try {
    if (flags.analytics) { await runAnalytics(); return }
    const apiKey = loadEnv('ANTHROPIC_API_KEY')
    const srtPath = flags.srt || transcribe(videoPath)
    const { stamped } = parseSrt(srtPath)
    if (!stamped) throw new Error('자막이 비어 있습니다')
    const data = await generate(apiKey, stamped)
    const outDir = writeOutputs(data, srtPath, videoPath)
    console.log(`\n✅ 완료 → ${outDir}`)
    console.log('   채널별 .txt + 배포팩.md(노션 붙여넣기용) 생성됨')
    console.log(`   숏폼 클립 컷: ${flags.clips ? '생성됨' : '건너뜀(--clips 로 켜기)'}`)
    await pushToNotion(outDir) // 네이버 초안 → 노션(토큰 있을 때)
    if (flags.publish) await publishClips(data, outDir)
  } catch (e) {
    console.error(`\n❌ ${e.message}`)
    process.exit(1)
  }
})()
