import Anthropic from '@anthropic-ai/sdk'

/**
 * AI가 JSON 문자열 값 안에 literal 줄바꿈을 넣을 때 JSON.parse가 깨지는 문제 방지.
 * 상태 머신으로 문자열 경계를 추적하여 제어 문자만 선택적으로 이스케이프.
 */
function repairJson(raw: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (ch === '\\') {
      result += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }

    // 문자열 값 내부의 literal 제어 문자 → 이스케이프 시퀀스로 변환
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue }
      if (ch === '\r') { result += '\\r'; continue }
      if (ch === '\t') { result += '\\t'; continue }
    }

    result += ch
  }

  return result
}

interface ServiceItem {
  name: string
  base_price: number
  unit: string
}

interface GeoInput {
  businessName: string
  address: string | null
  description: string | null
  services: ServiceItem[]
}

interface FaqItem {
  question: string
  answer: string
}

export interface GeoContent {
  seoTitle: string         // 페이지 <title> 태그용
  seoDescription: string   // meta description (160자 이내)
  seoKeywords: string      // 콤마 구분 키워드
  faqs: FaqItem[]          // FAQ 섹션 (AI가 찾은 보통 질문들)
}

// 업체 정보를 분석해 GEO 최적화 콘텐츠 자동 생성
// — AI 검색엔진(ChatGPT, Gemini, Perplexity)에 인용될 구조로 작성
export async function generateGeoContent(input: GeoInput): Promise<GeoContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('[APP] AI 기능을 사용하려면 API 키가 필요합니다')

  const client = new Anthropic({ apiKey })

  const serviceList = input.services
    .map((s) => `${s.name} (${s.base_price.toLocaleString()}원/${s.unit})`)
    .join(', ')

  const locationHint = input.address
    ? `위치: ${input.address}`
    : '위치 정보 없음'

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: `당신은 한국 청소 서비스 업체의 GEO(Generative Engine Optimization) 전문가입니다.
아래 업체 정보를 분석해서 ChatGPT, Gemini, Perplexity 같은 AI 검색엔진이
"청소업체 추천해줘" 같은 질문에 이 업체를 인용하도록 최적화된 콘텐츠를 생성하세요.

업체명: ${input.businessName}
${locationHint}
업체 소개: ${input.description || '청소 전문 업체'}
제공 서비스: ${serviceList || '청소 서비스'}

GEO 콘텐츠 생성 규칙:
- seoTitle: 업체명 + 핵심 서비스 + 지역 (60자 이내, 예: "강남 스파클 | 입주청소·정기청소 전문업체")
- seoDescription: 업체의 핵심 가치와 서비스 특징을 담은 설명 (150자 이내, AI가 직접 인용할 수 있는 명확한 문장)
- seoKeywords: 지역+서비스 조합 키워드 8개 (콤마 구분, 예: "강남 입주청소, 서초 정기청소, ...")
- faqs: AI 검색엔진이 자주 답하는 질문 5개 + 명확한 답변 (각 답변 100자 이내)
  질문 예시: 가격, 서비스 범위, 예약 방법, 소요 시간, 보장/재시공 정책

반드시 아래 JSON 형식으로만 응답하세요:
{
  "seoTitle": "...",
  "seoDescription": "...",
  "seoKeywords": "키워드1, 키워드2, ...",
  "faqs": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ]
}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON not found')
    return JSON.parse(repairJson(jsonMatch[0])) as GeoContent
  } catch (e) {
    console.error('[AI] GEO 콘텐츠 파싱 실패:', e, text)
    throw new Error('[APP] GEO 콘텐츠 생성에 실패했습니다')
  }
}

export interface PostContent {
  title: string
  summary: string       // 150자 이내 요약 (meta description)
  keyPoints: string[]   // 핵심 요약 3~4개 불릿 (글 상단 박스)
  content: string       // 본문 (마크다운)
  faqs: FaqItem[]       // 포스트 전용 FAQ 3개
  slug: string          // URL용 slug
}

interface PostInput {
  businessName: string
  address: string | null
  description: string | null
  services: ServiceItem[]
  topic?: string        // 작성할 주제 (없으면 AI가 선택)
  imageUrl?: string     // 업로드한 이미지 URL — Claude가 직접 분석
}

// 업체 블로그 포스트 자동 생성
// — AI 검색엔진이 인용할 수 있는 GEO 최적화 콘텐츠 작성
export async function generatePostContent(input: PostInput): Promise<PostContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('[APP] AI 기능을 사용하려면 API 키가 필요합니다')

  const client = new Anthropic({ apiKey })

  const serviceList = input.services
    .map((s) => `${s.name} (${s.base_price.toLocaleString()}원/${s.unit})`)
    .join(', ')

  const topicHint = input.topic
    ? `작성할 주제: ${input.topic}`
    : '주제: AI가 업체에 적합한 주제 자유 선택 (청소 노하우, 서비스 안내, 자주 묻는 질문 등)'

  const textPrompt = `당신은 한국 청소 서비스 업체의 GEO 블로그 포스팅 전문가입니다.
ChatGPT, Gemini, Perplexity 등 AI 검색엔진이 "청소 관련 질문"에 이 업체를 인용하도록
아래 구조에 맞게 포스트를 작성하세요.

업체명: ${input.businessName}
위치: ${input.address ?? '미입력'}
업체 소개: ${input.description ?? '청소 전문 업체'}
서비스: ${serviceList || '청소 서비스'}
${topicHint}
${input.imageUrl ? '위 첨부 이미지를 분석하여 이미지 내용을 포스트에 자연스럽게 반영하세요.' : ''}

=== 작성 구조 (Inblog GEO 최적화 포맷) ===

title: 검색 의도가 명확한 질문형 또는 정보형 제목 (50자 이내)
  예시: "에어컨 청소 주기, 몇 년에 한 번이 적당할까?", "입주청소 체크리스트 — 이사 전 꼭 확인할 10가지"

summary: meta description용 핵심 요약 (130자 이내, AI가 직접 인용할 수 있는 문장)

keyPoints: 글 상단에 표시할 핵심 요약 불릿 3~4개 (각 30자 이내, "✓ ~" 형식)
  예시: ["✓ 에어컨 청소는 2년에 1회 권장", "✓ 셀프 청소 시 필터만 가능, 내부는 전문업체 필요"]

content: 본문 (900~1200자). 아래 구조를 반드시 따를 것:
  ## [소제목1 — 질문형 또는 정보형]
  설명 2~3문단

  ## [소제목2]
  설명 2~3문단. 가능하면 비교 정보나 체크리스트 포함.
  - 항목1
  - 항목2

  ## [소제목3 — 업체 연결 자연스럽게]
  ${input.businessName}에서는 ... (자연스러운 업체 언급, 광고성 문구 금지)

faqs: 이 주제에서 독자가 실제로 궁금해할 질문 3개 + 명확한 답변
  (각 답변 80자 이내, AI가 인용하기 좋은 간결한 팩트)

slug: 제목을 영문 URL slug로 변환 (예: "air-conditioner-cleaning-guide")

=== 반드시 아래 JSON 형식으로만 응답 ===
{
  "title": "...",
  "summary": "...",
  "keyPoints": ["✓ ...", "✓ ...", "✓ ..."],
  "content": "## 소제목1\\n\\n본문...\\n\\n## 소제목2\\n\\n본문...",
  "faqs": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ],
  "slug": "..."
}`

  // 이미지가 있으면 URL로 직접 전달 (Claude vision)
  type MessageContent =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'url'; url: string } }

  const userContent: MessageContent[] = input.imageUrl
    ? [
        { type: 'image', source: { type: 'url', url: input.imageUrl } },
        { type: 'text', text: textPrompt },
      ]
    : [{ type: 'text', text: textPrompt }]

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: userContent }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON not found')
    return JSON.parse(repairJson(jsonMatch[0])) as PostContent
  } catch (e) {
    console.error('[AI] 포스트 생성 파싱 실패:', e, text)
    throw new Error('[APP] 포스트 생성에 실패했습니다')
  }
}

export interface TopicSuggestion {
  title: string    // 제안 포스트 제목
  reason: string   // 이 달에 인기인 이유 (한 줄, 15자 이내)
  topic: string    // generatePostAction에 넘길 topic 문자열
}

// 이번 달 소비자들이 많이 찾는 청소 관련 주제 5개 자동 생성
export async function generateTopicSuggestions(input: {
  businessName: string
  services: ServiceItem[]
  currentMonth: number   // 1~12
}): Promise<TopicSuggestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('[APP] AI 기능을 사용하려면 API 키가 필요합니다')

  const client = new Anthropic({ apiKey })

  const serviceNames = input.services.map((s) => s.name).join(', ')
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const currentMonthName = monthNames[input.currentMonth - 1]

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1400,
    messages: [
      {
        role: 'user',
        content: `당신은 한국 청소 서비스 업체의 블로그 콘텐츠 전략가입니다.
${currentMonthName} 기준으로 소비자들이 네이버/구글에서 많이 검색하는 청소 관련 주제를 추천하세요.

업체명: ${input.businessName}
제공 서비스: ${serviceNames || '청소 서비스'}
현재 월: ${currentMonthName}

규칙:
- 이 달에 실제로 검색이 많아지는 계절적 요인을 반영할 것
- 업체가 제공하는 서비스와 관련된 주제 우선
- 소비자가 직접 검색하는 질문형/정보형 제목
- reason은 10~15자 이내 짧게 (예: "이사 시즌 검색 급증", "여름철 에어컨 필수")

반드시 아래 JSON 배열로만 응답하세요 (10개):
[
  { "title": "포스트 제목", "reason": "이 달 인기 이유", "topic": "AI에게 전달할 작성 주제" },
  ...
]`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('JSON not found')
    return JSON.parse(repairJson(jsonMatch[0])) as TopicSuggestion[]
  } catch (e) {
    console.error('[AI] 주제 추천 파싱 실패:', e, text)
    throw new Error('[APP] 주제 추천 생성에 실패했습니다')
  }
}

// 업체명 → URL slug 변환 유틸
export function generateSlug(businessName: string, suffix: string): string {
  const normalized = businessName
    .toLowerCase()
    .replace(/\s+/g, '-')        // 공백 → 하이픈
    .replace(/[^\w\uAC00-\uD7A3가-힣-]/g, '')  // 특수문자 제거 (한글/영문/숫자/하이픈 허용)
    .replace(/-+/g, '-')         // 연속 하이픈 제거
    .replace(/^-|-$/g, '')       // 앞뒤 하이픈 제거
    .slice(0, 40)                // 최대 40자

  return `${normalized}-${suffix}`
}
