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
import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { fixTranscript, parseSrt } from './lib/transcript.mjs'

// 기본은 90일 챌린지 시리즈 시작점. 인터뷰 등 다른 시리즈면 --link 로 바꾼다.
const YT_LINK = (() => {
  const i = process.argv.indexOf('--link')
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : 'https://youtu.be/xa9yOE0ERr0'
})()
const LINK_LABEL = (() => {
  const i = process.argv.indexOf('--link-label')
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : '1일차부터 보기'
})()
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
  else if (a === '--at') flags.at = argv[++i] // 예약 시각(KST "YYYY-MM-DD HH:MM") — 전 클립 동일 시각 예약(--publish와 함께)
  else if (a === '--n') flags.n = parseInt(argv[++i], 10) // 목표 클립 개수(물량 모드). 기본 8
  else if (a === '--link') flags.link = argv[++i] // CTA 유튜브 링크(시리즈 시작점)
  else if (a === '--link-label') flags.linkLabel = argv[++i] // 링크 문구
  else if (a === '--topic') flags.topic = argv[++i] // 영상 맥락 한 줄(예: "대구 에어컨 청소 업체 대표 인터뷰")
  else if (a === '--no-publish-clips') flags.noPublishClips = true
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
  // ⚠ 주석(#)으로 남겨둔 옛 키를 집어오면 401 이 난다. 주석 줄은 먼저 걷어낸다.
  //   (2026-08-16 키 교체 후 실제로 발생 — '# 교체 전 값: ANTHROPIC_API_KEY=...' 를 읽어감)
  const body = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
  const m = body.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*"?([^"\\n\\r]+)"?`, 'm'))
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

// ── 3. 자막 파싱·정정은 scripts/lib/transcript.mjs 공용 모듈 사용 ──

// ── 4. Claude 재가공 (JSON 강제) ─────────────────────────────
const TOPIC_LINE = flags.topic ? `\n[이번 영상] ${flags.topic}\n- 인터뷰 영상이면 게스트(대표님)의 말을 주인공으로 세운다. 게스트 호칭·지역·업종은 자막에 나온 대로 써도 되지만, 우리 쪽 업체명·상업 링크는 넣지 않는다.\n` : ''

const SYSTEM = `너는 청소업 유튜브 영상(챌린지 일지 또는 업계 대표 인터뷰)을 다채널로 재가공하는 한국어 카피라이터다. 규칙을 반드시 지켜라.
${TOPIC_LINE}
[공통]
- 모든 글은 '입니다' 어체.
- 사용자 노출 문구에 "AI" 단어 금지(우리 서비스를 가리킬 때). 대신 "전문가 데이터/자동" 톤. (ChatGPT 등 외부 AI검색 플랫폼 지칭은 예외로 허용)
- 업체명·상업 링크 넣지 말 것. 유튜브 링크는 반드시 ${YT_LINK} 사용(문구는 "${LINK_LABEL}").
- 자막에 없는 매출·성과·수치를 지어내지 말 것. 사실만.
- ★ 자막은 자동 음성인식 결과라 오인식·비문이 많다. 문맥상 명백히 잘못 인식된 단어는 바로잡아 쓰고(예: '도급 복사'→'도급사'), 뜻이 불확실한 표현·숫자는 아예 인용하지 말고 확실히 이해되는 내용만 써라. 확실치 않은 고유명사는 빼라. 인용문은 자막을 그대로 붙여넣지 말고 뜻이 통하는 자연스러운 문장으로 다듬어라.
- "광고 0원 / 광고비 0원 / 광고 없이" 같은 표현 금지 — 검색광고는 유지하므로 오해 소지. 대신 "퍼포먼스 광고 대신 영업으로" 식으로.

[채널별 톤]
- blog(네이버 블로그): 소비자 눈높이 SEO 장문(1200자+). 핵심 키워드 "청소 창업"을 제목·첫문단·소제목에 자연스럽게 반복. 소제목(##) 목차형.
- cafe.afup(아프니까 사장이다): 전 업종 자영업자 대상 대중 핏. 솔직/실수 후크로 공감. "청소 창업" 키워드 노출.
- cafe.all(청소업의 모든 것): 카페장 류승찬이 직접 쓰는 '칼럼'. 에피소드 일지·요약이 아니라, 이번 편의 핵심 교훈 하나를 주제로 세운 도발적이고 확신에 찬 칼럼으로 재구성한다. 겸손·자기비하·사과("가르침 받으러 왔다/정답은 아니지만/배우고 싶습니다") 프레임 전면 금지. 말투 규칙: (1) 오프닝은 "카페장 류승찬입니다. 이번 칼럼에서는 ~에 대해 알아보겠습니다."로 시작. (2) 후크는 독자(사장님)를 먼저 치켜세운 뒤 반전한다("여러분 대부분은 저보다 청소를 잘하실 겁니다. 그런데 왜 오더는…"). "제가 장담하건대 / 죄송하지만 / 재수 없게 들릴 수 있지만" 같은 단정·도발 어법을 쓴다. (3) 핵심 주장은 짧고 단정적인 선언문으로 못박고("매출은 기술이 아니라 노출에서 나옵니다"), 핵심 키워드는 작은따옴표로 강조. (4) 큰 사례·비유로 시야를 넓혔다가 청소업으로 착지시킨다(글로벌 기업·자본주의 원리 등 — 매번 다른 소재로). (5) 명령형·직설 화법("~하십시오", "제발 ~ 좀 그만하십시오", "~에 목숨을 거세요")과 감정적 수사("피 터지게", "밤을 새워")를 쓴다. (6) 독자의 속마음을 따옴표로 대변한 뒤 반박·해법을 제시한다. (7) '입니다/습니다'체 + 명령형 혼용, 문단은 짧게, 한 줄 강조 문장을 자주 넣는다. (8) 마무리는 이번 편의 실천 지침을 던지고 "더 자세한 과정은 영상에서 — ${LINK_LABEL} → ${YT_LINK}"로 유도(OPS·상품 판매 유도 금지, CTA는 영상 링크로만). 자막에 없는 수치·성과는 지어내지 말 것. 형식은 네이버 카페 편집기 붙여넣기용 평문 — 마크다운(##, **, ---, 인용부호 >, [텍스트](링크)) 금지, 소제목은 줄바꿈+짧은 제목, 링크는 URL 그대로.
- cafe.dongwoo(청소동우회): 고인물 견제 주의. "저는 청소 서비스가 메인이 아니라 청소업체용 운영 자동화 툴을 만드는 사람"이라는 포지션으로 결과·과정을 공유하며 자연 노출. 아직 매출 전이면 자랑 대신 '포지션 심기' 톤.
- threads/x: build-in-public 짧은 텍스트. 대화 유도 질문으로 마무리.
- shorts_caption(쇼츠·릴스·틱톡 공용): 첫 1초 훅 + 3~4줄. hashtags는 별도 필드에.
- clips: 물량 전략. 독립적으로 이해되는(맥락 없이 봐도 되는) 훅 강한 구간을 요청받은 개수만큼 고른다. 각 15~50초, 자막 타임스탬프 기준. 정보전달보다 '스크롤 멈추게 하는' 순간(궁금증·숫자·반전·실수·감정) 우선. 각 clip마다:
  · title: 화면에 박을 초대형 훅 한 줄(짧게, 궁금증/숫자/반전)
  · caption: 게시글 본문 3~4줄
  · reason: 왜 이 구간이 반응 날지 한 줄(근거)

반드시 emit_content 툴을 호출해 결과를 넘긴다.`

// 구조화 출력 스키마 (툴 호출로 강제 → JSON 파싱 실패 원천 차단)
// ★ 스키마는 '평평한 문자열 필드'로 둔다. blog/cafe를 중첩 객체({title,body})로 두면
//   일부 입력에서 모델이 3편(afup/all/dongwoo)을 한 문자열로 뭉쳐 반환해 본문이 통째로
//   빈 값이 되는 사고가 재현됐다. 채널마다 독립 문자열 필드를 주면 확실히 각각 채워온다.
//   받은 뒤 generate()에서 기존 중첩 구조(data.blog / data.cafe.afup ...)로 리맵한다.
const CLIP_ITEM = {
  type: 'object',
  properties: {
    start: { type: 'string' }, end: { type: 'string' },
    title: { type: 'string' }, caption: { type: 'string' }, reason: { type: 'string' },
  },
  required: ['start', 'end', 'title', 'caption', 'reason'],
}
const OUTPUT_TOOL = {
  name: 'emit_content',
  description: '채널별 재가공 결과를 넘긴다. 각 채널 본문은 반드시 해당 문자열 필드에 직접 채운다(빈 값 금지·중첩 객체 금지).',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      blog_title: { type: 'string' }, blog_body: { type: 'string', description: '네이버 블로그 본문(1200자+)' },
      cafe_afup_title: { type: 'string' }, cafe_afup_body: { type: 'string', description: "카페 '아프니까 사장이다' 본문" },
      cafe_all_title: { type: 'string' }, cafe_all_body: { type: 'string', description: "카페 '청소업의 모든 것' 칼럼 본문" },
      cafe_dongwoo_title: { type: 'string' }, cafe_dongwoo_body: { type: 'string', description: "카페 '청소동우회' 본문" },
      threads: { type: 'string' },
      x: { type: 'string' },
      shorts_caption: { type: 'string' },
      hashtags: { type: 'string' },
    },
    required: [
      'summary', 'blog_title', 'blog_body',
      'cafe_afup_title', 'cafe_afup_body', 'cafe_all_title', 'cafe_all_body', 'cafe_dongwoo_title', 'cafe_dongwoo_body',
      'threads', 'x', 'shorts_caption', 'hashtags',
    ],
  },
}

// 클립은 글과 분리해서 별도 호출로 뽑는다.
// ★ 왜 분리하나: 한 번에 글+클립을 다 받으면 클립을 20개 넘게 요구하는 순간 max_tokens에 걸려
//   뒤쪽(클립)이 통째로 잘린다. 또 긴 영상은 자막을 구간별로 쪼개 각각 호출해야
//   앞부분만 훑고 끝나지 않고 영상 전체에서 골고루 뽑힌다.
const CLIPS_TOOL = {
  name: 'emit_clips',
  description: '이 구간에서 뽑은 숏폼 클립 후보를 넘긴다.',
  input_schema: {
    type: 'object',
    properties: { clips: { type: 'array', items: CLIP_ITEM } },
    required: ['clips'],
  },
}

// 채널별 사람이 읽는 이름 (누락 점검·요약 출력 공용)
const CHANNEL_LABELS = [
  ['네이버 블로그', d => d.blog?.body],
  ['카페 — 아프니까 사장이다', d => d.cafe?.afup?.body],
  ['카페 — 청소업의 모든 것', d => d.cafe?.all?.body],
  ['카페 — 청소동우회', d => d.cafe?.dongwoo?.body],
  ['스레드', d => d.threads],
  ['X', d => d.x],
  ['숏폼 캡션', d => d.shorts_caption],
  ['숏폼 클립', d => (d.clips || []).length ? 'ok' : ''],
]

async function generate(apiKey, stamped) {
  console.log('🤖 채널별 초안 생성 중 (Claude)...')
  const client = new Anthropic({ apiKey })
  // ★ max_tokens 32000 + 스트리밍: 블로그(1200자+)·카페 3편·스레드·X·숏폼·클립을 한 번에 만들어
  //   출력이 큼. 16000이면 뒤쪽(카페=커뮤니티 글)이 잘려 네이버 블로그만 나오는 사고가 났음.
  //   16000 초과는 SDK HTTP 타임아웃 방지를 위해 반드시 스트리밍(messages.stream)으로 받아야 함.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM,
    tools: [OUTPUT_TOOL],
    tool_choice: { type: 'tool', name: 'emit_content' },
    messages: [{ role: 'user', content: `에피소드 번호: EP.${ep}\n\n[자막 (타임스탬프 포함)]\n${stamped}` }],
  })
  const msg = await stream.finalMessage()
  const tool = msg.content.find(b => b.type === 'tool_use')
  if (!tool) throw new Error('구조화 출력(tool_use)이 없습니다')
  // ★ 토큰 한도에 걸려 JSON이 중간에 잘리면 카페 등 뒷 채널이 통째로 빠진 채 반환됨.
  //   조용히 넘기지 말고 즉시 중단 → 부분 결과가 "전부 나온 것처럼" 배포되는 사고 차단.
  if (msg.stop_reason === 'max_tokens') {
    throw new Error('생성 결과가 토큰 한도(max_tokens)에 걸려 잘렸습니다. 카페 등 일부 채널이 누락됐을 수 있어 중단합니다. 자막을 줄이거나 MODEL/max_tokens를 조정 후 다시 실행하세요.')
  }
  // 평평한 필드 → 기존 중첩 구조로 리맵(나머지 코드는 data.blog/data.cafe.afup 형태를 그대로 사용)
  const raw = tool.input
  const data = {
    summary: raw.summary,
    blog: { title: raw.blog_title || '', body: raw.blog_body || '' },
    cafe: {
      afup: { title: raw.cafe_afup_title || '', body: raw.cafe_afup_body || '' },
      all: { title: raw.cafe_all_title || '', body: raw.cafe_all_body || '' },
      dongwoo: { title: raw.cafe_dongwoo_title || '', body: raw.cafe_dongwoo_body || '' },
    },
    threads: raw.threads,
    x: raw.x,
    shorts_caption: raw.shorts_caption,
    hashtags: raw.hashtags,
    clips: [],
  }
  // ★ 필수 채널(네이버 블로그 + 카페 3곳) 누락 가드 — 커뮤니티 글이 빠진 채 진행되는 사고 재발 방지
  const missingRequired = CHANNEL_LABELS
    .slice(0, 4) // 앞 4개(블로그+카페3)만 필수
    .filter(([, get]) => !get(data))
    .map(([label]) => label)
  if (missingRequired.length) {
    throw new Error(`필수 채널 글이 비어 있습니다: ${missingRequired.join(', ')}. 부분 결과는 저장하지 않고 중단합니다 — 다시 실행하세요.`)
  }
  return data
}

// ── 4-b. 클립 대량 추출 (자막을 구간별로 쪼개 병렬 호출) ──────
function splitStamped(stamped, parts) {
  const lines = stamped.split('\n').filter(Boolean)
  const per = Math.ceil(lines.length / parts)
  const out = []
  for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per).join('\n'))
  return out
}

function clipSec(c) { return hms2sec(c.end) - hms2sec(c.start) }

async function generateClips(apiKey, stamped, targetN) {
  const client = new Anthropic({ apiKey })
  // ★ 개수를 먼저 정하면 좋은 걸 버리거나 나쁜 걸 채우게 된다.
  //   구간은 영상 길이에 맞춰 빠짐없이 나누고(20분당 1구간), 개수는 내용이 정한다.
  //   --n 을 준 경우에만 예전처럼 목표 개수를 맞춘다.
  const lastSec = (() => {
    const all = [...stamped.matchAll(/\[(\d+):(\d\d):(\d\d)/g)]
    if (!all.length) return 0
    const g = all[all.length - 1]
    return +g[1] * 3600 + +g[2] * 60 + +g[3]
  })()
  const autoMode = !targetN
  const parts = autoMode
    ? Math.max(1, Math.round(lastSec / 1200))          // 20분당 1구간
    : Math.max(1, Math.ceil(targetN / 7))
  const chunks = splitStamped(stamped, parts)
  const perChunk = autoMode ? 8 : Math.ceil(targetN / chunks.length)
  console.log(autoMode
    ? `✂️  클립 후보 추출 중... (${Math.round(lastSec / 60)}분 → ${chunks.length}구간, 기준 넘는 것만 — 개수 미정)`
    : `✂️  클립 후보 추출 중... (자막 ${chunks.length}구간 × 구간당 ${perChunk}개 목표)`)

  const jobs = chunks.map(async (chunk, idx) => {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [CLIPS_TOOL],
      tool_choice: { type: 'tool', name: 'emit_clips' },
      messages: [{
        role: 'user',
        content: `에피소드 번호: EP.${ep}\n이 자막은 전체 영상 중 ${idx + 1}/${chunks.length} 구간입니다.\n` +
          (autoMode
            ? `이 구간에서 '쇼츠로 내보낼 만한 것'만 골라 emit_clips로 넘기세요. 개수는 정해져 있지 않습니다.\n` +
              `- 기준에 못 미치면 억지로 채우지 말고 적게(0~2개) 내세요. 반대로 좋은 게 많으면 최대 ${perChunk}개까지 내세요.\n` +
              `- 기준: 이것만 따로 봐도 사장님이 "오, 이건 써먹겠다" 하거나 "어? 진짜?" 하고 멈출 구간.\n` +
              `- 그냥 설명·맞장구·중복되는 얘기는 제외. 평범하면 안 뽑는 게 맞습니다.\n`
            : `이 구간 안에서만 숏폼 클립을 ${perChunk}개 뽑아 emit_clips로 넘기세요.\n`) +
          `- start/end는 반드시 아래 자막에 실제로 존재하는 타임스탬프 범위 안에서 고를 것(구간 밖 금지)\n` +
          `- 각 클립 길이 15~50초, 서로 겹치지 말 것\n` +
          `- 맥락 없이 그것만 봐도 이해되는 구간만. 말이 중간에 끊기지 않게 문장 시작~끝으로 자를 것\n` +
          `- 정보보다 '스크롤 멈추는 순간'(숫자·반전·실수·돈·감정·업계 뒷얘기) 우선\n\n` +
          `[자막 (타임스탬프 포함)]\n${chunk}`,
      }],
    })
    const msg = await stream.finalMessage()
    const tool = msg.content.find(b => b.type === 'tool_use')
    return tool ? (tool.input.clips || []) : []
  })

  const results = await Promise.all(jobs)
  // 시간순 정렬 + 겹침/이상 길이 제거(구간 경계에서 중복이 생길 수 있음)
  const all = results.flat()
    .filter(c => c.start && c.end && clipSec(c) >= 10 && clipSec(c) <= 75)
    .sort((a, b) => hms2sec(a.start) - hms2sec(b.start))
  const kept = []
  for (const c of all) {
    const last = kept[kept.length - 1]
    if (last && hms2sec(c.start) < hms2sec(last.end)) continue // 앞 클립과 겹치면 버림
    kept.push(c)
  }
  console.log(`   → 클립 ${kept.length}개 확정 (후보 ${all.length}개 중 겹침 제거)`)
  return kept
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
  const blocks = fixTranscript(readFileSync(srtPath, 'utf8')).split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
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

  return outDir
}

// ── 5-b. 클립 컷 (병렬) ──────────────────────────────────────
// --burn: libass 있으면 자막 번인, 없으면 컷+.srt만(캡션은 CapCut 자동자막 권장)
function ffmpegAsync(args) {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', args, { stdio: 'ignore' })
    p.on('close', (code) => resolve(code))
  })
}

async function cutClips(data, outDir, srtPath, video) {
  if (!flags.clips || !video || !existsSync(video)) return
  const entries = srtEntries(srtPath)
  const burn = flags.burn && ffHasSubtitles()
  if (flags.burn && !burn) {
    console.log('⚠️  이 ffmpeg엔 subtitles(libass) 필터가 없어 자막 번인은 건너뜁니다.')
    console.log('    → 컷 + 클립별 .srt만 생성. 캡션은 CapCut 자동자막 또는 .srt import 권장.')
  }
  const mode = flags.vertical ? '9:16 세로 쇼츠 변환' : burn ? '클립 컷 + 자막 번인' : '하이라이트 클립 컷'
  const clips = data.clips || []
  console.log(`🎬 ${mode} 중... (${clips.length}개, 4개씩 병렬)`)

  const buildArgs = (c, i) => {
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
      // 가로 원본을 9:16 캔버스 가운데 배치 + 블러 배경(크롭 대신 여백채움)
      // ★ 배경 블러는 1/4 해상도에서 처리한 뒤 확대한다 — 어차피 흐린 배경이라 결과는 같은데
      //   1080x1920 원본에 gblur를 직접 걸면 클립당 수 분씩 걸려 물량 배포가 불가능해진다.
      const vbase =
        '[0:v]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=6,scale=1080:1920[bg];' +
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
    // crf 26: Ayrshare 미디어 업로드 30MB 제한 방어(50초 세로 클립도 10MB 안쪽)
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', out)
    return args
  }

  let done = 0
  const queue = clips.map((c, i) => ({ c, i }))
  const worker = async () => {
    for (;;) {
      const job = queue.shift()
      if (!job) return
      await ffmpegAsync(buildArgs(job.c, job.i))
      done++
      if (done % 5 === 0 || done === clips.length) console.log(`   ${done}/${clips.length} 완료`)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
}

// ── 6. Ayrshare 자동 게시·예약 (--publish) ───────────────────
const PLATFORMS = ['youtube', 'instagram', 'threads', 'facebook'] // 연결된 4채널(틱톡=계정 영구정지로 제외·X는 BYOK 미연결·네이버는 API 없음)

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

// --at 지정 시: 전 클립을 그 KST 시각에 동일 예약. 미지정 시: 내일부터 하루 1개씩 19:00 KST 분산
function scheduleUtc(i) {
  if (flags.at) {
    const m = flags.at.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
    if (!m) throw new Error(`--at 형식 오류: "${flags.at}" (예: "2026-08-08 10:00")`)
    const [, Y, Mo, D, H, Mi] = m
    const utcMs = Date.UTC(+Y, +Mo - 1, +D, +H - 9, +Mi, 0) // KST → UTC(-9h)
    return new Date(utcMs).toISOString().replace(/\.\d{3}Z$/, 'Z')
  }
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
// 채널별 내용을 '코드블록(plain text)'으로 넣는다. 그래야 네이버·카페 편집기에
// 통째로 복붙할 때 줄바꿈이 하나도 안 뭉개지고 그대로 살아난다.
// (인용구·볼드 같은 서식 블록으로 넣으면 붙여넣기 시 줄바꿈이 합쳐져 사용자가 다시 손봐야 함)
function nHeading(t) { return { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: t } }] } } }

// 코드블록(plain text) — 노션 rich_text 항목당 2000자 제한 방어를 위해 1900자씩 나눠 담는다
function nCode(content) {
  const s = String(content || '')
  const chunks = []
  for (let i = 0; i < s.length; i += 1900) chunks.push(s.slice(i, i + 1900))
  if (!chunks.length) chunks.push(' ')
  return {
    object: 'block',
    type: 'code',
    code: { language: 'plain text', rich_text: chunks.map(c => ({ type: 'text', text: { content: c } })) },
  }
}

async function pushToNotion(outDir, data) {
  let tok
  try { tok = loadEnv('NOTION_TOKEN') } catch { return } // 토큰 없으면 조용히 스킵
  const channels = [
    ['네이버 블로그', data.blog],
    ['카페 — 아프니까 사장이다', data.cafe?.afup],
    ['카페 — 청소업의 모든 것', data.cafe?.all],
    ['카페 — 청소동우회', data.cafe?.dongwoo],
  ]
  const children = []
  const skipped = []
  for (const [label, post] of channels) {
    if (!post || (!post.title && !post.body)) { skipped.push(label); continue } // 빈 채널은 조용히 넘기지 말고 기록
    children.push(nHeading(label))
    // 제목/본문을 하나의 코드블록에 담아 복붙 시 줄바꿈이 그대로 보존되게 함
    children.push(nCode(`[제목]\n${post.title || ''}\n\n[본문]\n${post.body || ''}`))
  }
  if (!children.length) return

  // 노션 children은 요청당 최대 100블록 → 첫 100개로 생성 후 나머지 append
  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent: { page_id: NOTION_DRAFTS_PARENT },
      icon: { type: 'emoji', emoji: '📝' },
      properties: { title: { title: [{ text: { content: `EP.${ep} 네이버 초안` } }] } },
      children: children.slice(0, 100),
    }),
  })
  const j = await r.json()
  if (r.status !== 200) { console.log(`⚠️ 노션 푸시 실패: ${r.status} ${JSON.stringify(j).slice(0, 120)}`); return }
  for (let i = 100; i < children.length; i += 100) {
    await fetch(`https://api.notion.com/v1/blocks/${j.id}/children`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tok}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ children: children.slice(i, i + 100) }),
    })
  }
  console.log(`📝 네이버 초안 → 노션: ${j.url}`)
  if (skipped.length) console.log(`   ⚠️ 노션에 빠진 채널(내용 없음): ${skipped.join(', ')}`)
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
    data.clips = await generateClips(apiKey, stamped, flags.n || null)
    const outDir = writeOutputs(data, srtPath, videoPath)
    await cutClips(data, outDir, srtPath, videoPath)
    console.log(`\n✅ 완료 → ${outDir}`)
    console.log('   채널별 .txt + 배포팩.md(노션 붙여넣기용) 생성됨')
    console.log(`   숏폼 클립 컷: ${flags.clips ? '생성됨' : '건너뜀(--clips 로 켜기)'}`)
    // ★ 매 실행 채널 요약 — 네이버 블로그만 나오고 커뮤니티 글이 빠지는 사고를 즉시 눈에 띄게 함
    const produced = CHANNEL_LABELS.filter(([, get]) => get(data)).map(([l]) => l)
    const missing = CHANNEL_LABELS.filter(([, get]) => !get(data)).map(([l]) => l)
    console.log(`\n📋 생성된 채널(${produced.length}/${CHANNEL_LABELS.length}): ${produced.join(', ')}`)
    if (missing.length) console.log(`⚠️  누락된 채널: ${missing.join(', ')} — 필요하면 다시 실행하세요`)
    await pushToNotion(outDir, data) // 네이버 초안 → 노션(토큰 있을 때)
    if (flags.publish && !flags.noPublishClips) await publishClips(data, outDir)
  } catch (e) {
    console.error(`\n❌ ${e.message}`)
    process.exit(1)
  }
})()
