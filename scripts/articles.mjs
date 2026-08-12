#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// 네이버 블로그·카페 글 물량 생산 (영상 1개 → 주제별 여러 편)
//
// 왜 필요한가: distribute.mjs 는 영상 1개당 채널별 '1편'만 만든다. 32분 인터뷰처럼
// 소재가 많은 영상은 쇼츠는 40개 나오는데 글은 4편에서 끝나 소재가 통째로 버려졌다.
// 이 스크립트는 자막에서 독립 주제를 N개 뽑고, 주제마다 블로그 1편 + 카페 2편을 쓴다.
//
// 사용법:
//   node scripts/articles.mjs --srt <자막경로> --label "김기범 대표 인터뷰" [--topics 18] [--cafes 2]
//
// 산출물: ~/Downloads/네이버초안_<label>/ 아래 편별 .txt + 노션 주제별 페이지
// ─────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { parseSrt } from './lib/transcript.mjs'

const YT_LINK = 'https://youtu.be/xa9yOE0ERr0'
const NOTION_DRAFTS_PARENT = '3a8a926a-bb65-818d-9adb-f35a4fca0d4b'
const MODEL = 'claude-sonnet-4-6'
const CONCURRENCY = 5

// ── 인자 ─────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flags = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--srt') flags.srt = argv[++i]
  else if (a === '--label') flags.label = argv[++i]
  else if (a === '--topics') flags.topics = parseInt(argv[++i], 10)
  else if (a === '--cafes') flags.cafes = parseInt(argv[++i], 10) // 주제당 카페 편수(1~3)
  else if (a === '--context') flags.context = argv[++i] // 영상 맥락 한 줄
  else if (a === '--no-notion') flags.noNotion = true
  else if (a === '--push-only') flags.pushOnly = argv[++i] // 이미 만든 폴더를 읽어 노션에만 재푸시(손질 후)
}
if (!flags.pushOnly && (!flags.srt || !flags.label)) {
  console.error('사용법: node scripts/articles.mjs --srt <자막경로> --label "<이름>" [--topics 18] [--cafes 2]')
  console.error('  손질 후 노션 재푸시: node scripts/articles.mjs --push-only <폴더> --label "<이름>"')
  process.exit(1)
}
const LABEL = flags.label
const TOPIC_N = flags.topics || 18
const CAFE_N = Math.min(3, Math.max(1, flags.cafes || 2))

function loadEnv(name) {
  const envPath = path.resolve('.env.local')
  if (!existsSync(envPath)) throw new Error('.env.local 을 찾을 수 없습니다 (레포 루트에서 실행하세요)')
  const m = readFileSync(envPath, 'utf8').match(new RegExp(`${name}\\s*=\\s*"?([^"\\n\\r]+)"?`))
  if (!m) throw new Error(`.env.local 에 ${name} 가 없습니다`)
  return m[1].trim()
}

// ── 카페별 톤 (distribute.mjs 와 동일 기준) ──────────────────
const CAFES = {
  afup: {
    name: '아프니까 사장이다',
    spec: '전 업종 자영업자 대상 대중 핏. 솔직한 실수·시행착오 고백을 후크로 공감을 산다. "청소 창업" 키워드를 자연스럽게 노출. 청소업을 모르는 타 업종 사장님도 이해되게 쓴다. 마크다운 금지(평문), 소제목은 줄바꿈 + 짧은 제목.',
  },
  all: {
    name: '청소업의 모든 것',
    spec: `카페장 류승찬이 직접 쓰는 '칼럼'. 요약·일지가 아니라 이 주제 하나를 세운 도발적이고 확신에 찬 칼럼. 겸손·자기비하·사과 프레임 전면 금지. (1) 오프닝은 "카페장 류승찬입니다. 이번 칼럼에서는 ~에 대해 알아보겠습니다." (2) 후크는 독자를 먼저 치켜세운 뒤 반전한다("여러분 대부분은 저보다 청소를 잘하실 겁니다. 그런데 왜…"). "제가 장담하건대 / 죄송하지만 / 재수 없게 들릴 수 있지만" 같은 단정·도발 어법. (3) 핵심 주장은 짧고 단정적인 선언문으로 못박고 핵심 키워드는 작은따옴표로 강조. (4) 큰 사례·비유로 시야를 넓혔다가 청소업으로 착지(매번 다른 소재). (5) 명령형·직설 화법("~하십시오", "제발 ~ 좀 그만하십시오"). (6) 독자의 속마음을 따옴표로 대변한 뒤 반박·해법. (7) 문단은 짧게, 한 줄 강조 문장 자주. (8) 마무리는 실천 지침 + "더 자세한 과정은 영상에서 — 1일차부터 보기 → ${YT_LINK}". 판매 유도 금지, CTA는 영상 링크로만. 마크다운(##, **, ---, >, [텍스트](링크)) 전면 금지 — 네이버 카페 편집기 붙여넣기용 평문.`,
  },
  dongwoo: {
    name: '청소동우회',
    spec: '청소업 고인물이 많은 곳이라 견제 주의. "저는 청소 서비스가 메인이 아니라 청소업체용 운영 자동화 툴을 만드는 사람"이라는 포지션으로, 배운 내용과 관찰을 공유하며 자연 노출한다. 자랑·훈수 톤 금지, 인터뷰에서 얻은 인사이트를 업계 선배들에게 공유하는 톤. 마크다운 금지(평문).',
  },
}

const COMMON_RULES = `[공통 규칙 — 반드시 지켜라]
- 모든 글은 '입니다' 어체.
- 사용자 노출 문구에 "AI" 단어 금지(우리 서비스를 가리킬 때). 대신 "전문가 데이터/자동" 톤. (ChatGPT 등 외부 AI검색 플랫폼 지칭은 예외)
- 우리 쪽 업체명·상업 링크 금지. 유튜브 링크는 ${YT_LINK} 만 사용(문구는 "1일차부터 보기").
- ★ 자막에 없는 매출·성과·수치를 지어내지 말 것. 자막에 근거가 있는 숫자만 쓰고, 단위가 불분명한 숫자는 아예 쓰지 말 것.
- ★ 자막은 자동 음성인식 결과라 오인식·비문이 많다. 문맥상 명백한 오인식은 바로잡아 쓰고, 뜻이 불확실한 표현·숫자는 인용하지 말 것. 인용문은 자막을 그대로 붙여넣지 말고 뜻이 통하는 자연스러운 문장으로 다듬어라.
- "광고 0원 / 광고비 0원 / 광고 없이" 표현 금지 — 검색광고는 유지하므로 오해 소지. "퍼포먼스 광고 대신 영업으로" 식으로.
- 인터뷰 영상이면 게스트(대표님)의 말을 주인공으로 세운다. 게스트 호칭·지역·업종은 자막에 나온 대로 써도 된다.
- 같은 영상에서 나온 여러 편이므로, 배정된 주제 하나만 깊게 판다. 다른 주제로 넘어가지 말 것(편끼리 내용이 겹치면 실패).`

// ── 1단계: 주제 추출 ─────────────────────────────────────────
const TOPICS_TOOL = {
  name: 'emit_topics',
  description: '자막에서 독립적으로 글 한 편이 되는 주제를 뽑아 넘긴다.',
  input_schema: {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '이 주제를 한 줄로 (글 제목 아님, 주제 이름)' },
            angle: { type: 'string', description: '이 편에서 밀 핵심 주장·앵글 한 줄' },
            keyword: { type: 'string', description: '네이버 검색을 노릴 핵심 키워드 (예: 정기청소 영업)' },
            points: { type: 'array', items: { type: 'string' }, description: '자막에 실제로 나온 근거·발언 3~6개' },
            range: { type: 'string', description: '자막에서 이 주제가 나오는 대략 구간 (예: 03:07~04:48)' },
          },
          required: ['title', 'angle', 'keyword', 'points', 'range'],
        },
      },
    },
    required: ['topics'],
  },
}

async function extractTopics(client, stamped) {
  console.log(`🔎 주제 추출 중... (목표 ${TOPIC_N}개)`)
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: `너는 청소업 콘텐츠 기획자다. 영상 자막에서 '각각 독립된 글 한 편이 될 수 있는' 주제를 뽑는다.
${COMMON_RULES}`,
    tools: [TOPICS_TOOL],
    tool_choice: { type: 'tool', name: 'emit_topics' },
    messages: [{
      role: 'user',
      content: `${flags.context ? `[영상 맥락] ${flags.context}\n\n` : ''}아래 자막에서 주제를 ${TOPIC_N}개 뽑아 emit_topics로 넘기세요.

조건:
- 주제끼리 내용이 겹치면 안 됩니다. 각각 다른 글감이어야 합니다.
- 검색 수요가 있을 만한 주제(영업·단가·견적·직원·도급·계약·판로 등 실무)를 우선하되, 마인드·에피소드 주제도 섞으세요.
- points 에는 자막에 실제로 나온 발언·근거만 적으세요. 지어내지 마세요.
- 자막 전체(처음부터 끝까지)에서 골고루 뽑으세요. 앞부분만 훑지 마세요.

[자막 (타임스탬프 포함)]
${stamped}`,
    }],
  })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'max_tokens') throw new Error('주제 추출이 토큰 한도에 걸려 잘렸습니다 — --topics 를 줄여 다시 실행하세요')
  const tool = msg.content.find(b => b.type === 'tool_use')
  if (!tool) throw new Error('주제 추출 결과(tool_use)가 없습니다')
  const topics = (tool.input.topics || []).filter(t => t.title && t.angle)
  console.log(`   → 주제 ${topics.length}개 확정`)
  return topics
}

// ── 2단계: 주제별 글 생성 ────────────────────────────────────
function postsTool(cafeKeys) {
  const props = {
    blog_title: { type: 'string', description: '네이버 블로그 제목 (핵심 키워드 포함, 32자 안쪽)' },
    blog_body: { type: 'string', description: '네이버 블로그 본문 1200자 이상. 소제목(##) 목차형, 핵심 키워드를 제목·첫문단·소제목에 자연 반복' },
  }
  const required = ['blog_title', 'blog_body']
  for (const k of cafeKeys) {
    props[`cafe_${k}_title`] = { type: 'string', description: `카페 '${CAFES[k].name}' 글 제목` }
    props[`cafe_${k}_body`] = { type: 'string', description: `카페 '${CAFES[k].name}' 본문 800자 이상` }
    required.push(`cafe_${k}_title`, `cafe_${k}_body`)
  }
  return {
    name: 'emit_posts',
    description: '이 주제로 쓴 채널별 글을 넘긴다. 각 본문은 해당 필드에 직접 채운다(빈 값 금지).',
    input_schema: { type: 'object', properties: props, required },
  }
}

async function writePosts(client, topic, cafeKeys, idx, total) {
  const cafeSpecs = cafeKeys.map(k => `- cafe_${k} (${CAFES[k].name}): ${CAFES[k].spec}`).join('\n')
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: `너는 청소업 콘텐츠를 네이버 블로그·카페용으로 쓰는 한국어 카피라이터다.
${COMMON_RULES}

[채널별 톤]
- blog (네이버 블로그): 소비자·사장님 눈높이 SEO 장문(1200자+). 배정된 핵심 키워드를 제목·첫문단·소제목에 자연스럽게 반복. 소제목(##) 목차형으로 구성.
${cafeSpecs}

반드시 emit_posts 툴을 호출해 결과를 넘긴다.`,
    tools: [postsTool(cafeKeys)],
    tool_choice: { type: 'tool', name: 'emit_posts' },
    messages: [{
      role: 'user',
      content: `${flags.context ? `[영상 맥락] ${flags.context}\n\n` : ''}[배정된 주제 ${idx + 1}/${total}]
주제: ${topic.title}
핵심 앵글: ${topic.angle}
노릴 키워드: ${topic.keyword}
자막 구간: ${topic.range}
자막에 나온 근거:
${(topic.points || []).map(p => `- ${p}`).join('\n')}

이 주제 하나만 깊게 파서 채널별 글을 써주세요. 다른 주제로 새지 마세요.

[참고용 자막 발췌 구간의 원문]
${topic.excerpt || '(위 근거 목록 참고)'}`,
    }],
  })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'max_tokens') throw new Error('토큰 한도 초과')
  const tool = msg.content.find(b => b.type === 'tool_use')
  if (!tool) throw new Error('tool_use 없음')
  const raw = tool.input
  const posts = [{ channel: '네이버 블로그', key: 'blog', title: raw.blog_title || '', body: raw.blog_body || '' }]
  for (const k of cafeKeys) {
    posts.push({
      channel: `카페 — ${CAFES[k].name}`, key: `cafe_${k}`,
      title: raw[`cafe_${k}_title`] || '', body: raw[`cafe_${k}_body`] || '',
    })
  }
  const empty = posts.filter(p => !p.body).map(p => p.channel)
  if (empty.length) throw new Error(`본문 빈 채널: ${empty.join(', ')}`)
  return posts
}

// 동시 실행 제한 풀
async function pool(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  const worker = async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      try {
        results[i] = { ok: true, value: await fn(items[i], i) }
      } catch (e) {
        results[i] = { ok: false, error: e.message }
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return results
}

// ── 3단계: 파일 출력 ─────────────────────────────────────────
function safeName(s) {
  return s.replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
}

function writeFiles(outDir, results, topics) {
  mkdirSync(outDir, { recursive: true })
  const index = [`# ${LABEL} — 네이버 블로그·카페 초안`, '']
  let fileCount = 0
  results.forEach((r, i) => {
    const t = topics[i]
    const no = String(i + 1).padStart(2, '0')
    if (!r.ok) {
      index.push(`## ${no}. ${t.title} — ❌ 생성 실패 (${r.error})`, '')
      return
    }
    index.push(`## ${no}. ${t.title}`, `- 키워드: ${t.keyword} / 구간: ${t.range}`, `- 앵글: ${t.angle}`)
    r.value.forEach((p) => {
      const fname = `${no}_${p.key}_${safeName(t.title)}.txt`
      writeFileSync(path.join(outDir, fname), `[채널]\n${p.channel}\n\n[제목]\n${p.title}\n\n[본문]\n${p.body}\n`, 'utf8')
      fileCount++
      index.push(`  - ${p.channel} → ${fname} (${p.body.length}자)`)
    })
    index.push('')
  })
  writeFileSync(path.join(outDir, '00_목차.md'), index.join('\n'), 'utf8')
  return fileCount
}

// ── 4단계: 노션 푸시 (주제별 하위 페이지) ────────────────────
function nHeading(t) { return { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: t } }] } } }
function nCode(content) {
  const s = String(content || '')
  const chunks = []
  for (let i = 0; i < s.length; i += 1900) chunks.push(s.slice(i, i + 1900))
  if (!chunks.length) chunks.push(' ')
  return { object: 'block', type: 'code', code: { language: 'plain text', rich_text: chunks.map(c => ({ type: 'text', text: { content: c } })) } }
}

async function notionCreatePage(tok, parentId, title, children, isChildPage) {
  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent: isChildPage ? { page_id: parentId } : { page_id: parentId },
      icon: { type: 'emoji', emoji: '📝' },
      properties: { title: { title: [{ text: { content: title } }] } },
      children: children.slice(0, 100),
    }),
  })
  const j = await r.json()
  if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 160)}`)
  for (let i = 100; i < children.length; i += 100) {
    await fetch(`https://api.notion.com/v1/blocks/${j.id}/children`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tok}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ children: children.slice(i, i + 100) }),
    })
  }
  return j
}

async function pushToNotion(results, topics) {
  let tok
  try { tok = loadEnv('NOTION_TOKEN') } catch { console.log('⚠️  NOTION_TOKEN 없음 — 노션 푸시 건너뜀'); return null }

  // 부모 페이지 1개 생성 → 주제별 하위 페이지
  const parent = await notionCreatePage(tok, NOTION_DRAFTS_PARENT, `${LABEL} — 네이버 초안 모음`, [
    nHeading('구성'),
    nCode(topics.map((t, i) => `${String(i + 1).padStart(2, '0')}. ${t.title}  [키워드: ${t.keyword}]`).join('\n')),
  ], true)
  console.log(`📝 노션 모음 페이지: ${parent.url}`)

  let ok = 0
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (!r.ok) continue
    const t = topics[i]
    const children = []
    for (const p of r.value) {
      children.push(nHeading(p.channel))
      children.push(nCode(`[제목]\n${p.title}\n\n[본문]\n${p.body}`))
    }
    try {
      await notionCreatePage(tok, parent.id, `${String(i + 1).padStart(2, '0')}. ${t.title}`, children, true)
      ok++
    } catch (e) {
      console.log(`   ⚠️ ${t.title} 노션 실패: ${e.message}`)
    }
  }
  console.log(`   → 주제 페이지 ${ok}/${results.filter(r => r.ok).length}개 생성`)
  return parent.url
}

// 이미 만든 폴더를 읽어 results/topics 형태로 복원 — 파일을 손질한 뒤 노션에만 다시 올릴 때 사용
function loadFromDir(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.txt')).sort()
  const byTopic = new Map()
  for (const f of files) {
    const m = f.match(/^(\d+)_(blog|cafe_[a-z]+)_(.+)\.txt$/)
    if (!m) continue
    const [, no, , title] = m
    const raw = readFileSync(path.join(dir, f), 'utf8')
    const channel = (raw.match(/\[채널\]\n([^\n]+)/) || [])[1] || ''
    const postTitle = (raw.match(/\[제목\]\n([^\n]+)/) || [])[1] || ''
    const body = (raw.split('[본문]\n')[1] || '').trimEnd()
    if (!byTopic.has(no)) byTopic.set(no, { title, posts: [] })
    byTopic.get(no).posts.push({ channel, title: postTitle, body })
  }
  const nos = [...byTopic.keys()].sort()
  const topics = nos.map(no => ({ title: byTopic.get(no).title, keyword: '', range: '' }))
  const results = nos.map(no => ({ ok: true, value: byTopic.get(no).posts }))
  return { topics, results }
}

// ── 실행 ─────────────────────────────────────────────────────
;(async () => {
  try {
    if (flags.pushOnly) {
      const dir = flags.pushOnly
      if (!existsSync(dir)) throw new Error(`폴더가 없습니다: ${dir}`)
      const { topics, results } = loadFromDir(dir)
      const total = results.reduce((s, r) => s + r.value.length, 0)
      console.log(`📤 폴더에서 읽어 노션 재푸시... (주제 ${topics.length}개 / 글 ${total}편)`)
      await pushToNotion(results, topics)
      return
    }
    const client = new Anthropic({ apiKey: loadEnv('ANTHROPIC_API_KEY') })
    const { stamped } = parseSrt(flags.srt)
    if (!stamped) throw new Error('자막이 비어 있습니다')

    const topics = await extractTopics(client, stamped)
    if (!topics.length) throw new Error('주제를 뽑지 못했습니다')

    // 주제별 자막 발췌 붙이기 (range 기준) — 근거를 원문으로 다시 보여줘 인용 정확도를 올림
    const lines = stamped.split('\n')
    const toSec = (t) => { const p = t.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1] }
    for (const t of topics) {
      const m = (t.range || '').match(/(\d+:\d+(?::\d+)?)\s*[~\-–]\s*(\d+:\d+(?::\d+)?)/)
      if (!m) continue
      const a = toSec(m[1]), b = toSec(m[2])
      t.excerpt = lines.filter(l => {
        const ts = l.match(/^\[(\d+:\d+:\d+)\]/)
        if (!ts) return false
        const s = toSec(ts[1])
        return s >= a - 10 && s <= b + 10
      }).join('\n')
    }

    // 카페 배정 — 주제마다 CAFE_N곳씩 돌려가며 배정(카페별로 고르게 쌓이도록)
    const keys = Object.keys(CAFES)
    console.log(`✍️  글 생성 중... (주제 ${topics.length}개 × 블로그1 + 카페${CAFE_N} = ${topics.length * (1 + CAFE_N)}편, ${CONCURRENCY}개씩 병렬)`)
    let done = 0
    const results = await pool(topics, CONCURRENCY, async (t, i) => {
      const cafeKeys = Array.from({ length: CAFE_N }, (_, k) => keys[(i + k) % keys.length])
      const posts = await writePosts(client, t, cafeKeys, i, topics.length)
      done++
      console.log(`   ${done}/${topics.length} — ${t.title}`)
      return posts
    })

    const failed = results.filter(r => !r.ok)
    const outDir = path.join(homedir(), 'Downloads', `네이버초안_${safeName(LABEL)}`)
    const fileCount = writeFiles(outDir, results, topics)

    console.log(`\n✅ 완료 → ${outDir}`)
    console.log(`   글 ${fileCount}편 생성 (주제 ${results.filter(r => r.ok).length}/${topics.length})`)
    if (failed.length) console.log(`⚠️  실패 주제 ${failed.length}개 — 다시 실행하면 그 주제만 재생성됩니다`)

    // 채널별 편수 집계 — 어느 카페에 몇 편 쌓였는지 바로 보이게
    const tally = {}
    for (const r of results) if (r.ok) for (const p of r.value) tally[p.channel] = (tally[p.channel] || 0) + 1
    console.log('\n📋 채널별 편수')
    for (const [c, n] of Object.entries(tally)) console.log(`   ${c}: ${n}편`)

    if (!flags.noNotion) await pushToNotion(results, topics)
  } catch (e) {
    console.error(`\n❌ ${e.message}`)
    process.exit(1)
  }
})()
