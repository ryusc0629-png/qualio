import { getClaude } from '@/lib/ai/client'
import { buildRegionPromptHint, naturalRegionLabel } from '@/lib/address/parse-region'
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
  serviceAreas?: string[] | null // 추가 출장 지역 (주소 사다리 외 더 넓은 지역)
  // 주력 고객('b2b' 상가·사무실 / 'b2c' 가정집). 제목·키워드에 어떤 서비스를 앞세울지 가른다
  targetCustomer?: string | null
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

  const client = getClaude('geo-content')

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

  // 지역 사다리 — 핵심 동/구에 집중하되 상위 지역(시·도·권역)을 가끔 언급해 검색 범위 확장
  const regionHint = buildRegionPromptHint(input.address, input.serviceAreas)

  // 주력 고객 — 서비스 목록에 주거·상업이 섞여 있어도 사장님이 고른 쪽을 앞세운다.
  // (이게 없으면 등록 순서나 개수에 따라 엉뚱한 서비스가 제목에 박힌다)
  const audienceRule = input.targetCustomer === 'b2b'
    ? `[주력 고객: 상가·사무실 등 사업장(B2B)]
- seoTitle과 seoKeywords 앞쪽에는 반드시 사업장 대상 서비스(사무실·상가·공장·병원·학원 정기청소, 상업시설 대청소 등)를 앞세우세요.
- 입주·이사청소나 가전청소 같은 가정집 대상 서비스는 실제로 제공하더라도 제목에 넣지 말고, 키워드 뒤쪽에 1~2개까지만 넣으세요.`
    : `[주력 고객: 가정집(B2C)]
- seoTitle과 seoKeywords 앞쪽에는 가정집 대상 서비스(입주·이사청소, 가전청소 등)를 앞세우세요.
- 사업장 대상 정기청소는 실제로 제공하더라도 키워드 뒤쪽에 1~2개까지만 넣으세요.`

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
${serviceList}

${audienceRule}

중요: 위에 주어진 실제 정보(서비스·가격·지역·후기)만 사용하세요. 없는 사실을 지어내지 마세요.

GEO 콘텐츠 생성 규칙:
- seoTitle: 핵심 지역명 + 업체명 + 핵심 서비스 (60자 이내, 예: "강남 스파클 | 사무실·상가 정기청소 전문업체"). 서비스는 위 [주력 고객] 규칙을 따를 것.
  ★ 업체명은 위에 적힌 "${input.businessName}" 을 글자 그대로 쓸 것. '클린'·'청소' 같은 말을 붙이거나 빼거나 띄어쓰기를 바꾸지 말 것. 간판에 없는 이름이 검색에 나가면 고객이 다른 업체로 안다.
  ★ 제목에는 위 [지역 사다리]에 실제로 적힌 것 중 가장 좁은 행정구역을 넣을 것. 다만 주소에 구·동이 없으면(예: "부산광역시"까지만 등록) 지어내지 말고 있는 데까지만 쓸 것. 출장 지역 목록에서 구 하나를 골라 본사 소재지인 양 쓰는 것은 금지 — 실제로 "영도구 청강클린"처럼 없는 소재지가 검색에 나간 적이 있다.
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
}

interface PostInput {
  businessName: string
  address: string | null
  description: string | null
  services: ServiceItem[]
  topic?: string        // 작성할 주제 (없으면 AI가 선택)
  imageUrl?: string     // 업로드한 이미지 URL — Claude가 직접 분석
  imageUrls?: string[]  // 현장 사진 여러 장 (Claude 비전) — 있으면 imageUrl보다 우선
  fieldNotes?: string   // 사장님이 현장에서 남긴 메모 — 있으면 이 글의 핵심 재료로 사용
  serviceAreas?: string[] | null // 추가 출장 지역
  model?: string        // 본문 생성 모델 (플랜별 — 미지정 시 기본 Haiku)
  realCases?: string[]  // 실제 작업 사례(익명) — 본문 고유성·신뢰도용 근거
  keyword?: string      // 이 글의 핵심 검색 키워드 (제목·본문에 자연 반영)
  relatedKeywords?: string[] // 연관 검색어(실검색량 순) — 본문에 자연스럽게 녹임
  titleOverride?: string // 계획표에 확정된 제목 — 있으면 이 제목 그대로 사용(달력=발행 일치)
  // 같은 지역 다른 고객사가 이미 쓴 제목 — 글자 그대로 같은 제목이 나오지 않게 피한다
  // (주제가 겹치는 건 어쩔 수 없지만, 제목까지 같으면 우리 고객끼리 순위를 깎는다)
  avoidTitles?: string[]
}

// 업체 블로그 포스트 자동 생성
// — AI 검색엔진이 인용할 수 있는 GEO 최적화 콘텐츠 작성
export async function generatePostContent(input: PostInput): Promise<PostContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('[APP] AI 기능을 사용하려면 API 키가 필요합니다')

  const client = getClaude('geo-content')

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

  // 사장님 현장 메모 — 있으면 이 글의 핵심 재료(사진과 함께 실제 작업을 살려 씀)
  const fieldNotesBlock = input.fieldNotes && input.fieldNotes.trim()
    ? `\n[사장님 현장 메모 — 이 글의 핵심 재료다. 아래 메모와 첨부 사진을 바탕으로, 실제로 그 현장에서 있었던 일을 살려 쓸 것. 이 메모가 있으면 다른 주제보다 이 메모를 최우선으로 삼는다]\n"${input.fieldNotes.trim()}"\n- 메모의 사실(작업 내용·상황·결과)을 중심으로 쓰되, 메모에 없는 수치·상호·실명은 절대 지어내지 말 것.\n- 첨부 사진이 있으면 사진 속 실제 장면(공간·상태·장비·작업)을 구체적으로 반영해 생생하게 쓸 것.\n- 메모가 짧거나 반말·비문이어도 전문가가 쓴 것처럼 읽기 좋게 다듬어 완성할 것.`
    : ''

  // 실제 검색량 기반 키워드 — 제목·본문을 진짜 검색어에 맞춰 상위노출 확률↑
  const related = (input.relatedKeywords ?? []).slice(0, 8)
  const keywordBlock = input.keyword
    ? `\n[검색 최적화 키워드 — 매우 중요]\n- 이 글의 핵심 검색 키워드: "${input.keyword}". 제목(title)·요약(summary)·첫 문단에 반드시 자연스럽게 포함하고, 본문 전체에 3~5회 자연스럽게 반복할 것(억지 삽입·단순 나열 금지 — 저품질 처리됨).${related.length > 0 ? `\n- 아래 연관 검색어도 본문에 자연스럽게 녹여 검색 노출을 넓힐 것(제목엔 넣지 말 것): ${related.join(', ')}` : ''}`
    : ''

  // 계획표에 이미 확정된 제목이 있으면 그대로 사용 — 달력 미리보기와 발행 제목을 일치시킴
  const titleRule = input.titleOverride
    ? `\n[제목 고정 — 매우 중요] 이 글의 제목(title)은 반드시 아래 문구를 그대로 사용할 것(수정·재작성·번역 금지): "${input.titleOverride}". summary·slug·본문은 이 제목에 자연스럽게 맞출 것.`
    : ''

  // 같은 지역 다른 업체가 쓴 제목 회피 — 주제가 같아도 각도·표현을 달리하게 한다
  const avoid = (input.avoidTitles ?? []).slice(0, 40)
  const avoidBlock = avoid.length > 0
    ? `\n[제목 중복 금지 — 매우 중요] 같은 지역 다른 업체가 이미 쓴 아래 제목들과 글자 그대로 같거나 거의 같은 제목은 절대 쓰지 말 것. 주제가 겹쳐도 제목의 각도(대상·상황·질문 형태)를 반드시 다르게 잡을 것.\n${avoid.map((t) => `- ${t}`).join('\n')}`
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
${(input.imageUrls?.length || input.imageUrl) ? '위 첨부 사진들을 분석하여 사진 속 실제 장면(공간·상태·장비·작업)을 포스트에 자연스럽게 반영하세요.' : ''}${fieldNotesBlock}${realCasesBlock}${keywordBlock}${titleRule}${avoidBlock}

[지역·고유성 규칙 — 검색 노출에 매우 중요]
- 본문·소제목에 핵심 지역(동/구)을 자연스럽게 2~4회 녹일 것. 상위 지역(시·도·권역)은 1~2회만 언급해 "핵심 지역 전문"이라는 신호를 흐리지 말 것.
- 이 업체만의 실제 정보(위 서비스명·가격·소개·지역)를 구체적으로 반영할 것. 어느 업체에나 통하는 일반론·복붙형 문장은 금지 — 다른 업체 글과 절대 비슷하면 안 됨(중복 콘텐츠로 검색에서 누락됨).
- 위 [실제 작업 사례]가 제공됐다면 본문(주로 소제목3 또는 업체 연결 단락)에 1개를 익명으로 녹여 "실제로 해본 곳"이라는 신뢰·고유성을 줄 것. 단, 사례에 없는 수치·상호·실명은 만들지 말 것.

[서비스 대상 공간 규칙 — 절대 어기지 말 것, 어기면 글 폐기]
- "정기청소"(정기 관리·정기 방문 포함)는 **상업시설·사무실·공장·상가·매장·병원·학원 등 '업무(비주거) 공간'의 반복 관리** 서비스다. 가정집(아파트·빌라 등 주거 공간)의 정기 방문 청소가 절대 아니다.
  → 정기청소 글에는 '맞벌이 가정·1인 가구·주부·집·주방 가스레인지·욕실 곰팡이·거실' 같은 **주거 소재를 쓰지 말 것**. 대신 '사무실·매장·상가·공장·병원 등의 바닥·유리·공용 화장실·출입구·집기' 같은 **업무공간 소재**로 쓸 것. 상주 인력이 관리해도 놓치는 부분을 전문 업체가 주기적으로 관리한다는 논지로.
- 가정집(주거) 대상은 입주청소·이사청소·인테리어 후 청소처럼 **'1회성' 서비스**다. 이런 서비스 글에서만 가정집 소재를 쓸 것. 절대 정기청소와 섞지 말 것.
- 그 외 서비스도 실제 대상 공간(주거/업무/가전 등)을 벗어난 소재를 지어내지 말 것. 어떤 공간을 대상으로 하는지 모호하면 업무·주거를 단정하지 말고 서비스 자체 설명에 집중할 것.

[설득·가독성 규칙 — 정보 신뢰도는 지키되 '읽고 문의하고 싶게']
- 고객 언어로 번역: '우리 자랑(특징)'이 아니라 '고객이 얻는 이익'으로 쓸 것. 핵심 문장은 "그래서 고객에게 뭐가 좋은데?"에 1초 만에 답이 돼야 함. 예: "10년 경력" → "어떤 돌발 상황도 실수 없이 안전하게 마무리", "최신 장비" → "눈에 안 보이는 먼지·세균까지 잡아 안심".
- 쉬운 말: 중학생도 이해할 단어로. 어려운 전문용어는 쉽게 풀어 쓸 것("고도의 프로토콜" X → "눈에 안 보이는 먼지까지 제거" O).
- 모바일 가독성: 한 문장이 두 줄을 넘지 않게 짧게 끊고, 2~3문장마다 문단을 나눠 여백을 줄 것. 스마트폰으로 훑어봐도 소제목·굵은 글씨만으로 핵심이 전달되게 할 것.
- 신뢰 요소는 사실 그대로만: 안전·위생, 편리함(맡기면 본업에 집중), 재작업·환불 보장, 실제 작업 사례(사회적 증거)를 근거로 신뢰를 줄 것. 단, 과장·낚시(무조건·100%·충격·소름)·허위 수치는 금지 — 정보 글의 신뢰도와 AI 검색 노출을 해침.

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

  ## [소제목4 — 업체 연결 (문제 → 해결 → 제안)]
  아래 3단계 흐름으로 자연스럽게 쓸 것 (광고성 과장 금지, 2~3문단):
  1) 문제: 앞에서 다룬 독자의 고민·위험을 한 번 더 짧게 짚어 공감을 만든다.
  2) 해결: ${input.businessName}가 그 문제를 '어떻게 다르게' 해결하는지 — 특징이 아니라 고객이 얻는 이익 중심으로 쓴다. (실제 작업 사례가 있으면 여기에 익명으로 1개 녹여 "실제로 해본 곳"이라는 신뢰를 준다)
  3) 제안: "부담 없이 견적·상담 받아보세요"처럼 다음에 할 행동을 쉽고 명확하게 안내한다.

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

  // 현장 사진 여러 장 우선, 없으면 단일 imageUrl 폴백 (비용·토큰 고려해 최대 8장)
  const visionImages = input.imageUrls?.length
    ? input.imageUrls
    : (input.imageUrl ? [input.imageUrl] : [])
  const userContent: MessageContent[] = visionImages.length > 0
    ? [
        ...visionImages.slice(0, 8).map((url): MessageContent => ({ type: 'image', source: { type: 'url', url } })),
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
      const parsed = JSON.parse(repairJson(jsonMatch[0])) as PostContent
      // 계획표 확정 제목이 있으면 최종적으로 강제 — 모델이 살짝 바꿔도 달력과 100% 일치
      if (input.titleOverride) parsed.title = input.titleOverride
      return parsed
    } catch (e) {
      lastErr = e
      console.error(`[AI] 포스트 생성 파싱 실패 (시도 ${attempt}/2):`, e instanceof Error ? e.message : e)
    }
  }

  console.error('[AI] 포스트 생성 최종 실패:', lastErr)
  throw new Error('[APP] 포스트 생성에 실패했습니다')
}

// 검색용 키워드/질문에 붙는 홍보성 꼬리말(추천·잘하는 곳 등)을 떼어 순수 핵심어만 남긴다.
// 예: "울산 청소업체 추천" → "울산 청소업체", "울산 인테리어 후 청소 잘하는 곳" → "울산 인테리어 후 청소"
function stripPromoSuffix(s: string): string {
  return s
    .trim()
    .replace(/\s*(추천|잘\s*하는\s*곳|제일\s*잘하는\s*곳|잘하는\s*업체|좋은\s*곳|좋은\s*업체|베스트|best|순위|가격|비용|후기)\s*$/i, '')
    .trim()
}

// '카피가 아니라 키워드 나열'로 보이는 제목인지 판별(안전망 트리거).
// 홍보성 꼬리말로 끝나거나(예: "울산 정기청소 추천"), 원문 검색어와 사실상 동일하면 true.
export function isKeywordishTitle(title: string, source?: string): boolean {
  const t = (title ?? '').trim()
  if (!t) return true
  if (source && t === source.trim()) return true
  // 문장 부호(물음표·쉼표·— 등)가 전혀 없고 홍보성 꼬리말로 끝나면 키워드 나열로 간주
  const endsPromo = /(추천|잘\s*하는\s*곳|좋은\s*곳|좋은\s*업체|베스트|best|순위)\s*$/i.test(t)
  const hasSentenceMark = /[?？,，·—…!]/.test(t)
  return endsPromo && !hasSentenceMark
}

// AI 없이도 항상 '문장형 카피'를 보장하는 결정적(deterministic) 폴백.
// 키워드는 앞에 그대로 살려 검색·AI 노출을 지키고, 뒤에 클릭 유도 문구를 붙인다.
// seed(발행 순서 등)로 패턴을 돌려 고객사·날짜마다 제목이 겹치지 않게 한다.
export function keywordToCopyTitle(input: { question: string; keyword: string | null }, seed = 0): string {
  const base = stripPromoSuffix(input.keyword || input.question) || (input.keyword || input.question).trim()
  const patterns = [
    (b: string) => `${b}, 어디에 맡겨야 후회 없을까?`,
    (b: string) => `${b}, 실패 없이 고르는 3가지 기준`,
    (b: string) => `${b} 맡기기 전 꼭 확인해야 할 것`,
    (b: string) => `${b}, 전문 업체가 필요한 이유`,
    (b: string) => `${b}, 이렇게 준비하면 끝까지 깔끔합니다`,
    (b: string) => `${b}, 견적 전에 알아두면 좋은 점`,
  ]
  const idx = ((seed % patterns.length) + patterns.length) % patterns.length
  return patterns[idx](base)
}

// 공략할 GEO 검색어(약점 질문) 여러 개를 받아, 각각 카피라이팅된 지역 롱테일 제목으로 변환.
// 계획표 확정 시 1회만 호출(제목만 생성이라 저렴) → 달력·발행이 같은 좋은 제목을 쓴다.
// ★ 실패·키 없음·키워드형 응답이어도 절대 '맨 키워드'를 그대로 내보내지 않는다.
//   결정적 카피 폴백(keywordToCopyTitle)으로 항상 문장형 제목을 보장한다.
//   (계획표는 월 1회 고정 저장되므로, 여기서 한 번 나쁜 제목이 나오면 한 달간 박힌다 → 폴백 품질이 중요)
export async function generateGeoTitles(input: {
  businessName: string
  address: string | null
  serviceAreas?: string[] | null
  targets: { question: string; keyword: string | null }[]
  model?: string
}): Promise<string[]> {
  if (input.targets.length === 0) return []
  // 어떤 실패 경로든 최종적으로 이 카피 폴백으로 수렴 (맨 키워드 금지)
  const copyFallback = input.targets.map((t, i) => keywordToCopyTitle(t, i))

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return copyFallback

  const region = naturalRegionLabel(input.address)

  const prompt = `당신은 한국 청소업체의 GEO 블로그 제목 카피라이터입니다.
아래 "공략 검색어"마다, 그 검색 의도를 담아 사람이 클릭하고 싶은 한국어 블로그 제목을 정확히 1개씩 지으세요.

규칙:
- 각 제목 50자 이내, 질문형 또는 정보형 (예: "울산 정기청소, 어떤 주기와 업체를 선택해야 할까?")
- 해당 검색어의 핵심 키워드(지역명 포함)를 제목 앞부분에 자연스럽게 넣을 것${region ? ` — 지역: ${region}` : ''}
- 딱딱한 키워드 나열 금지. 반드시 카피라이팅된 문장형 제목으로.
- 절대 "~추천", "~잘하는 곳", "~순위" 처럼 검색어를 그대로 나열하며 끝내지 말 것(저품질).
- 지역명은 '[지역]' 대괄호 고정 접두사로 앞에 붙이지 말 것 — 문장 속에 자연스럽게 녹일 것(모든 글이 같은 틀이면 네이버 유사문서로 판단돼 불리).
- 서로 다른 제목으로(중복·유사 금지). 글마다 문장 구조도 다르게.

공략 검색어 (순서 유지):
${input.targets.map((t, i) => `${i + 1}. ${t.question}${t.keyword ? ` (핵심 키워드: ${t.keyword})` : ''}`).join('\n')}

반드시 아래 JSON 배열로만 응답 (입력과 개수·순서 동일):
["제목1", "제목2", ...]`

  const client = getClaude('geo-content')
  // 일시적 오류로 한 달치 제목이 통째로 폴백되는 걸 줄이기 위해 1회 재시도
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await client.messages.create({
        model: input.model ?? 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) continue
      const titles = JSON.parse(match[0]) as unknown
      if (!Array.isArray(titles)) continue
      // 각 항목: 유효한 문장형이면 채택, 비었거나 키워드형이면 카피 폴백으로 교정
      return input.targets.map((t, i) => {
        const v = titles[i]
        if (typeof v === 'string' && v.trim() && !isKeywordishTitle(v, t.question)) return v.trim()
        return keywordToCopyTitle(t, i)
      })
    } catch (e) {
      console.error(`[AI] GEO 제목 생성 실패(시도 ${attempt + 1}/2):`, e instanceof Error ? e.message : e)
    }
  }
  return copyFallback
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

  const client = getClaude('geo-content')

  const serviceNames = input.services.map((s) => s.name).join(', ')
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const currentMonthName = monthNames[input.currentMonth - 1]
  // 지역명(시·구) — 지역+서비스 조합 키워드에 활용. 자연 검색형("울산 울주군")으로.
  const region = naturalRegionLabel(input.address)

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
- [대상 공간 구분] "정기청소/정기 관리"는 상업시설·사무실·공장·상가·병원 등 '업무(비주거) 공간' 반복 관리 서비스다. 이 주제는 반드시 업무공간 관점으로 잡을 것(가정집 정기청소로 오해 금지). 가정집은 입주청소·이사청소 등 1회성 주제로만 다룰 것
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
