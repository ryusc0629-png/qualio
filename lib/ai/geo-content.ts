import Anthropic from '@anthropic-ai/sdk'
import { buildRegionPromptHint } from '@/lib/address/parse-region'
import { getKeywordStats, opportunityScore, type KeywordStat } from '@/lib/keyword/naver-searchad'

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
  category?: string | null
}

interface GeoInput {
  businessName: string
  address: string | null
  description: string | null
  services: ServiceItem[]
  testimonials?: { quote: string; author: string }[] | null
  serviceAreas?: string[] | null // 추가 출장 지역 (주소 사다리 외 더 넓은 지역)
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

  // 서비스를 카테고리(주거/가전/상업 등)별로 묶어 구성을 또렷하게 전달
  const byCategory = new Map<string, string[]>()
  for (const s of input.services) {
    const cat = s.category?.trim() || '기타'
    const line = `${s.name} (${s.base_price.toLocaleString()}원/${s.unit})`
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), line])
  }
  const serviceList = input.services.length
    ? [...byCategory.entries()].map(([cat, items]) => `[${cat}] ${items.join(', ')}`).join('\n')
    : '청소 서비스'

  // 실제 고객 후기 — 있으면 설명·FAQ에 신뢰 근거로 활용
  const reviewBlock = input.testimonials && input.testimonials.length > 0
    ? `\n실제 고객 후기(과장 없이 신뢰 근거로만 활용):\n${input.testimonials.map((t) => `- "${t.quote}" — ${t.author}`).join('\n')}`
    : ''

  // 지역 사다리 — 핵심 동/구에 집중하되 상위 지역(시·도·권역)을 가끔 언급해 검색 범위 확장
  const regionHint = buildRegionPromptHint(input.address, input.serviceAreas)

  const message = await client.messages.create({
    // GEO 콘텐츠는 업체당 가끔 1회 생성 — 품질이 곧 검색 노출이라 상위 모델 사용
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: `당신은 한국 청소 서비스 업체의 GEO(Generative Engine Optimization) 전문가입니다.
아래 업체 정보를 분석해서 ChatGPT, Gemini, Perplexity 같은 AI 검색엔진이
"청소업체 추천해줘" 같은 질문에 이 업체를 인용하도록 최적화된 콘텐츠를 생성하세요.

업체명: ${input.businessName}
[지역 사다리]
${regionHint}
업체 소개: ${input.description || '청소 전문 업체'}
제공 서비스(카테고리별):
${serviceList}${reviewBlock}

중요: 위에 주어진 실제 정보(서비스·가격·지역·후기)만 사용하세요. 없는 사실을 지어내지 마세요.

GEO 콘텐츠 생성 규칙:
- seoTitle: 핵심 지역명 + 업체명 + 핵심 서비스 (60자 이내, 예: "강남 스파클 | 입주청소·정기청소 전문업체"). 제목에는 가장 좁은 핵심 지역(동/구)을 넣을 것.
- seoDescription: 실제 서비스·가격대·지역을 녹인 핵심 가치 설명 (150자 이내, AI가 직접 인용할 수 있는 명확한 문장). 후기가 있으면 신뢰 요소를 자연스럽게 반영.
- seoKeywords: 지역+서비스 조합 키워드 8개 (콤마 구분, 예: "강남 입주청소, 서초 정기청소, ..."). 핵심 지역(동/구)을 중심으로 하되, 키워드 2~3개는 상위 지역(시·도·권역)+서비스 조합으로 만들어 넓은 검색도 잡을 것. 추가 출장 지역이 있으면 1~2개 포함. 제공하지 않는 서비스는 넣지 말 것.
- faqs: AI 검색엔진이 자주 답하는 질문 5개 + 명확한 답변 (각 답변 100자 이내). 가격 질문은 위 실제 가격을 근거로 답할 것.
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
  imagePrompts?: string[] // 소제목별로 서로 다른 장면 3개 (맥락 맞춤 이미지용)
  imagePrompt?: string  // (구버전 호환) 단일 장면 프롬프트 — imagePrompts 없을 때 폴백
}

interface PostInput {
  businessName: string
  address: string | null
  description: string | null
  services: ServiceItem[]
  topic?: string        // 작성할 주제 (없으면 AI가 선택)
  imageUrl?: string     // 업로드한 이미지 URL — Claude가 직접 분석
  serviceAreas?: string[] | null // 추가 출장 지역
  model?: string        // 본문 생성 모델 (플랜별 — 미지정 시 기본 Haiku)
  realCases?: string[]  // 실제 작업 사례(익명) — 본문 고유성·신뢰도용 근거
  keyword?: string      // 이 글의 핵심 검색 키워드 (제목·본문에 자연 반영)
  relatedKeywords?: string[] // 연관 검색어(실검색량 순) — 본문에 자연스럽게 녹임
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

  // 지역 사다리 — 핵심 동/구에 집중하되 상위 지역을 가끔 언급
  const regionHint = buildRegionPromptHint(input.address, input.serviceAreas)

  // 실제 작업 사례(익명) — 있으면 본문에 근거로 녹여 복제 불가능한 고유성 확보
  const realCasesBlock = input.realCases && input.realCases.length > 0
    ? `\n[실제 작업 사례 — 이 업체가 실제로 수행한 익명 사례다. 아래 중 1개를 골라 본문 스토리텔링에 자연스럽게(고객 식별정보 없이) 녹여 고유성을 높일 것. 사례에 없는 사실·수치는 절대 지어내지 말 것]\n${input.realCases.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    : ''

  // 실제 검색량 기반 키워드 — 제목·본문을 진짜 검색어에 맞춰 상위노출 확률↑
  const related = (input.relatedKeywords ?? []).slice(0, 8)
  const keywordBlock = input.keyword
    ? `\n[검색 최적화 키워드 — 매우 중요]\n- 이 글의 핵심 검색 키워드: "${input.keyword}". 제목(title)·요약(summary)·첫 문단에 반드시 자연스럽게 포함하고, 본문 전체에 3~5회 자연스럽게 반복할 것(억지 삽입·단순 나열 금지 — 저품질 처리됨).${related.length > 0 ? `\n- 아래 연관 검색어도 본문에 자연스럽게 녹여 검색 노출을 넓힐 것(제목엔 넣지 말 것): ${related.join(', ')}` : ''}`
    : ''

  const textPrompt = `당신은 한국 청소 서비스 업체의 GEO 블로그 포스팅 전문가입니다.
ChatGPT, Gemini, Perplexity 등 AI 검색엔진이 "청소 관련 질문"에 이 업체를 인용하도록
아래 구조에 맞게 포스트를 작성하세요.

업체명: ${input.businessName}
[지역 사다리]
${regionHint}
업체 소개: ${input.description ?? '청소 전문 업체'}
서비스: ${serviceList || '청소 서비스'}
${topicHint}
${input.imageUrl ? '위 첨부 이미지를 분석하여 이미지 내용을 포스트에 자연스럽게 반영하세요.' : ''}${realCasesBlock}${keywordBlock}

[지역·고유성 규칙 — 검색 노출에 매우 중요]
- 본문·소제목에 핵심 지역(동/구)을 자연스럽게 2~4회 녹일 것. 상위 지역(시·도·권역)은 1~2회만 언급해 "핵심 지역 전문"이라는 신호를 흐리지 말 것.
- 이 업체만의 실제 정보(위 서비스명·가격·소개·지역)를 구체적으로 반영할 것. 어느 업체에나 통하는 일반론·복붙형 문장은 금지 — 다른 업체 글과 절대 비슷하면 안 됨(중복 콘텐츠로 검색에서 누락됨).
- 위 [실제 작업 사례]가 제공됐다면 본문(주로 소제목3 또는 업체 연결 단락)에 1개를 익명으로 녹여 "실제로 해본 곳"이라는 신뢰·고유성을 줄 것. 단, 사례에 없는 수치·상호·실명은 만들지 말 것.

=== 작성 구조 (Inblog GEO 최적화 포맷) ===

title: 검색 의도가 명확한 질문형 또는 정보형 제목 (50자 이내)
  예시: "에어컨 청소 주기, 몇 년에 한 번이 적당할까?", "입주청소 체크리스트 — 이사 전 꼭 확인할 10가지"

summary: meta description용 핵심 요약 (130자 이내, AI가 직접 인용할 수 있는 문장)

keyPoints: 글 상단에 표시할 핵심 요약 불릿 3~4개 (각 30자 이내, "✓ ~" 형식)
  예시: ["✓ 에어컨 청소는 2년에 1회 권장", "✓ 셀프 청소 시 필터만 가능, 내부는 전문업체 필요"]

content: 본문 (1500~2000자, 네이버 블로그 상위노출 최적 길이 — 이 범위를 반드시 채울 것. 1500자 미만으로 끝내지 말 것). 아래 구조를 반드시 따를 것:
  ## [소제목1 — 질문형 또는 정보형]
  설명 3~4문단. 독자가 이 주제를 처음 접해도 이해할 수 있도록 충분히 설명.

  ## [소제목2 — 구체적 정보/수치/비교]
  설명 3~4문단. 비교 정보, 수치, 체크리스트 등 팩트 중심으로 작성.
  - 항목1
  - 항목2
  - 항목3

  ## [소제목3 — 실용 팁 또는 주의사항]
  3~4문단. 독자가 바로 활용할 수 있는 구체적 행동 지침.

  ## [소제목4 — 업체 연결 자연스럽게]
  ${input.businessName}에서는 ... (자연스러운 업체 언급, 광고성 문구 금지, 2~3문단)

faqs: 이 주제에서 독자가 실제로 궁금해할 질문 3개 + 명확한 답변
  (각 답변 80자 이내, AI가 인용하기 좋은 간결한 팩트)

slug: 제목을 영문 URL slug로 변환 (예: "air-conditioner-cleaning-guide")

imagePrompts: 이 포스트에 넣을 서로 다른 사진 3장의 영문 장면 묘사 배열 (각 1~2문장, 영문만, 정확히 3개)
  예시: [
    "a professional cleaner deep-cleaning the inside of a wall-mounted air conditioner in a bright Korean apartment, sparkling clean cooling fins, water droplets",
    "a spotless bright Korean living room with a freshly cleaned air conditioner, calm comfortable atmosphere, no person",
    "a neatly organized clean refrigerator interior with fresh food, sparkling clean shelves, no person"
  ]
  규칙:
  - 반드시 소제목1·2·3(글의 서로 다른 부분) 각각에 어울리는 서로 다른 장면 3개로 구성할 것 — 같은 대상·같은 앵글 반복 금지
  - 각 장면은 그 문단의 핵심 소재(예: 에어컨 내부 세척 / 깨끗해진 거실 / 냉장고 정리)를 구체적으로 묘사
  - ⚠️ 곰팡이·오염·벌레·세균 등 혐오/위험 소재를 직접 묘사하지 말 것(이미지 안전필터에 막힘). 대신 "전문 세척 작업 중" 또는 "깨끗하게 관리된 결과" 같은 긍정·결과 중심 장면으로 표현
  - 사람 얼굴 클로즈업 금지, 글자/간판/로고가 들어가지 않는 장면으로 (이미지에 텍스트 금지)
  - 사실적 사진 스타일 (style 수식어는 시스템이 자동 추가하므로 장면만 묘사)

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
  "slug": "...",
  "imagePrompts": ["...", "...", "..."]
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

  // AI가 간헐적으로 깨진 JSON(본문 안에 이스케이프 안 된 따옴표 등)을 내면 파싱이 실패한다.
  // 다시 생성하면 대개 정상 JSON이 나오므로 최대 2회까지 재시도해 자동 발행이 조용히 멈추지 않게 한다.
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    const message = await client.messages.create({
      // 플랜별 모델 — 상위 플랜은 심층 글(Sonnet), 미지정 시 기본 Haiku
      model: input.model ?? 'claude-haiku-4-5-20251001',
      // 본문 1500~2000자 + 요약·keyPoints·FAQ JSON까지 담아야 함.
      // 한국어 1자≈1.5토큰이라 전체 출력이 커서 중간 잘림 방지용으로 넉넉히 확보
      max_tokens: 8000,
      messages: [{ role: 'user', content: userContent }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('JSON not found')
      return JSON.parse(repairJson(jsonMatch[0])) as PostContent
    } catch (e) {
      lastErr = e
      console.error(`[AI] 포스트 생성 파싱 실패 (시도 ${attempt}/2):`, e instanceof Error ? e.message : e)
    }
  }

  console.error('[AI] 포스트 생성 최종 실패:', lastErr)
  throw new Error('[APP] 포스트 생성에 실패했습니다')
}

export interface TopicSuggestion {
  title: string    // 제안 포스트 제목
  reason: string   // 이 달에 인기인 이유 (한 줄, 15자 이내)
  topic: string    // generatePostAction에 넘길 topic 문자열
  keyword?: string          // 네이버 검색창에 실제로 입력할 핵심 키워드
  monthlySearches?: number  // 실제 월간 검색량 (검색광고 API, 없으면 미표시)
  competition?: string      // 경쟁도 '낮음'|'중간'|'높음'
}

// 이번 달 소비자들이 많이 찾는 청소 관련 주제 5개 자동 생성
export async function generateTopicSuggestions(input: {
  businessName: string
  services: ServiceItem[]
  currentMonth: number   // 1~12
  recentTitles?: string[]  // 이미 발행한 제목들 — 중복(유사 주제 포함) 방지용
  address?: string | null  // 지역+서비스 롱테일 키워드 생성용
  skipKeywordData?: boolean // 자동 발행 등 검색량 배지가 필요 없는 경로 — 네이버 API 호출 생략(지연·의존성 제거)
}): Promise<TopicSuggestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('[APP] AI 기능을 사용하려면 API 키가 필요합니다')

  const client = new Anthropic({ apiKey })

  const serviceNames = input.services.map((s) => s.name).join(', ')
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const currentMonthName = monthNames[input.currentMonth - 1]
  // 지역명(시·구) — 지역+서비스 조합 키워드에 활용
  const region = input.address ? input.address.split(' ').slice(0, 2).join(' ') : null

  // 이미 쓴 제목을 AI에 그대로 넘겨 "글자가 달라도 같은 주제"를 의미 기준으로 걸러내게 함
  const avoidBlock = input.recentTitles && input.recentTitles.length > 0
    ? `\n\n[이미 이번 달에 발행한 글 — 아래와 같거나 비슷한 주제는 절대 추천 금지]\n${input.recentTitles.map((t) => `- ${t}`).join('\n')}\n(예: '새집증후군'을 이미 다뤘다면 표현만 바꾼 새집증후군 주제도 금지. 완전히 다른 청소 주제를 추천할 것)`
    : ''

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
${region ? `지역: ${region}` : ''}
현재 월: ${currentMonthName}${avoidBlock}

규칙:
- 이미 발행한 주제와 겹치거나 비슷한 주제는 절대 추천하지 말 것 (서로 다른 주제 10개)
- 이 달에 실제로 검색이 많아지는 계절적 요인을 반영할 것
- 업체가 제공하는 서비스와 관련된 주제 우선
- 소비자가 직접 검색하는 질문형/정보형 제목
- reason은 10~15자 이내 짧게 (예: "이사 시즌 검색 급증", "여름철 에어컨 필수")
- keyword: 그 주제의 '대표 검색어'를 1~2단어로 짧게(네이버 검색량이 많은 형태, 공백 최소). 긴 문장·설명형 금지.${region ? ` 지역이 뚜렷하면 지역+서비스 (예: "${region.split(' ').pop()}에어컨청소").` : ''} 예: "에어컨청소", "곰팡이제거", "입주청소"

반드시 아래 JSON 배열로만 응답하세요 (10개):
[
  { "title": "포스트 제목", "reason": "이 달 인기 이유", "topic": "AI에게 전달할 작성 주제", "keyword": "핵심 검색어" },
  ...
]`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  let suggestions: TopicSuggestion[]
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('JSON not found')
    suggestions = JSON.parse(repairJson(jsonMatch[0])) as TopicSuggestion[]
  } catch (e) {
    console.error('[AI] 주제 추천 파싱 실패:', e, text)
    throw new Error('[APP] 주제 추천 생성에 실패했습니다')
  }

  // 실제 검색량·경쟁도로 데이터 보강 + 기회 점수 순 정렬
  // (검색광고 API 키가 없거나 실패하면 빈 Map → 기존 AI 추천 순서 그대로 유지)
  // 자동 발행 등 배지가 필요 없는 경로는 생략 — 네이버 API 지연·의존성을 발행 흐름에서 제거
  if (input.skipKeywordData) return suggestions
  try {
    const seeds = suggestions.map((s) => s.keyword).filter((k): k is string => !!k)
    if (seeds.length > 0) {
      const stats = await getKeywordStats(seeds)
      if (stats.size > 0) {
        for (const s of suggestions) {
          const stat = s.keyword ? stats.get(s.keyword) : undefined
          if (stat) {
            s.monthlySearches = stat.monthlySearches
            s.competition = stat.competition
          }
        }
        // 검색량 대비 경쟁이 낮은(기회 큰) 주제를 앞으로. 데이터 없는 주제는 뒤로.
        const score = (s: TopicSuggestion): number =>
          s.monthlySearches !== undefined && s.competition !== undefined
            ? opportunityScore({ keyword: s.keyword ?? '', monthlySearches: s.monthlySearches, competition: s.competition as KeywordStat['competition'] })
            : -1
        suggestions.sort((a, b) => score(b) - score(a))
      }
    }
  } catch (e) {
    console.error('[Keyword] 검색량 데이터 보강 실패(무시하고 진행):', e instanceof Error ? e.message : e)
  }

  return suggestions
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

  // 영문 소문자/숫자/하이픈만 남김 (한글 업체명 등은 제거) — 공유 시 깨짐·NFC 문제 방지.
  // 영문이 하나도 없으면 suffix만 사용해 항상 유효한 영문 slug를 보장.
  const ascii = normalized.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return ascii ? `${ascii}-${suffix}` : suffix
}
