import Anthropic from '@anthropic-ai/sdk'

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
    return JSON.parse(jsonMatch[0]) as GeoContent
  } catch (e) {
    console.error('[AI] GEO 콘텐츠 파싱 실패:', e, text)
    throw new Error('[APP] GEO 콘텐츠 생성에 실패했습니다')
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
