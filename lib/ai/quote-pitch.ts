import Anthropic from '@anthropic-ai/sdk'

export interface QuotePitchReason {
  emoji: string
  title: string
  description: string
}

export interface CleaningFact {
  number: string   // "3배", "47종", "99%"
  label: string    // "VOC 초과", "세균 번식"
  detail: string   // "새 아파트 입주 직후"
}

export interface QuotePitch {
  headline: string
  subheadline: string
  reasons: [QuotePitchReason, QuotePitchReason, QuotePitchReason]
  urgencyText: string
  cleaningFacts: [CleaningFact, CleaningFact, CleaningFact]
}

const FALLBACK_PITCH: QuotePitch = {
  headline: '입주 전, 한 번의 청소가 평생 위생을 결정합니다',
  subheadline: '눈에 보이지 않는 유해물질과 세균까지 전문가가 완벽하게 제거합니다',
  reasons: [
    { emoji: '🧪', title: '새집증후군 제거', description: '입주 직후 유해화학물질(VOC) 농도는 기준치의 최대 3배. 전문 처리 없이는 자연 휘발에 수개월이 걸립니다.' },
    { emoji: '🦠', title: '세균 서식지 제거', description: '욕실 줄눈, 싱크대 배수구는 일반 청소로 제거되지 않는 세균의 온상입니다.' },
    { emoji: '✨', title: '입주 첫 날의 선물', description: '가구와 짐이 들어오기 전 딱 한 번. 이후엔 절대 할 수 없는 완벽한 청소를 지금 하세요.' },
  ],
  urgencyText: '짐 들어오기 전 지금이 유일한 기회입니다',
  cleaningFacts: [
    { number: '3배', label: 'VOC 농도', detail: '새 아파트 입주 직후' },
    { number: '47종', label: '세균 서식', detail: '주방 싱크대 배수구' },
    { number: '6개월', label: '자연 휘발', detail: '방치 시 유해물질 제거 기간' },
  ],
}

export async function generateQuotePitch({
  businessName,
  category,
  serviceName,
  spaceSize,
}: {
  businessName: string
  category: string | null
  serviceName: string
  spaceSize?: number | null
}): Promise<QuotePitch> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return FALLBACK_PITCH

  const client = new Anthropic({ apiKey })

  const contextText = [
    `서비스: ${serviceName}`,
    spaceSize ? `공간 크기: ${spaceSize}평` : '',
    category ? `업체 소개: ${category}` : '',
    `제공 업체: ${businessName}`,
  ].filter(Boolean).join('\n')

  const prompt = `당신은 프리미엄 청소 서비스의 '맞춤 제안서' 작성 전문가입니다.
이 문서는 불특정 다수를 위한 광고가 아니라, 해당 고객 한 명만을 위해 발행된 공식 견적 제안서입니다.
블로그 카피, 공포 마케팅, 일반적 문구는 절대 사용하지 마세요.

고객 상황:
${contextText}

작성 규칙:
- headline: "고객님을 위한 [구체적 상황] 맞춤 제안" 형식 (예: "고객님을 위한 42평 프리미엄 입주 클리닝 제안")
- subheadline: 업체가 직접 이 고객을 위해 팀을 투입한다는 뉘앙스 (예: "다트클린 전문 팀이 직접 투입되어 숨은 분진까지 완벽하게 제거합니다")
- cleaningFacts: 이 서비스가 왜 해당 고객 상황에 꼭 필요한지 — 공포 통계 금지, 대신 고객이 직접 체감할 수 있는 구체적 작업 포인트 3가지 (숫자 포함)
- reasons: 이 업체를 선택해야 하는 이유 3가지 — 작업 전문성, 사후 보증, 고객 편의 관점
- 한국어, 정중하고 전문적인 어조

아래 JSON 형식으로만 응답하세요:
{
  "headline": "25자 이내, '고객님을 위한 ~' 형식",
  "subheadline": "50자 이내, 업체+팀 투입 뉘앙스",
  "cleaningFacts": [
    {"number": "숫자+단위", "label": "10자 이내 작업 포인트", "detail": "20자 이내 설명"},
    {"number": "숫자+단위", "label": "10자 이내 작업 포인트", "detail": "20자 이내 설명"},
    {"number": "숫자+단위", "label": "10자 이내 작업 포인트", "detail": "20자 이내 설명"}
  ],
  "reasons": [
    {"emoji": "이모지", "title": "12자 이내 제목", "description": "60자 이내 설명"},
    {"emoji": "이모지", "title": "12자 이내 제목", "description": "60자 이내 설명"},
    {"emoji": "이모지", "title": "12자 이내 제목", "description": "60자 이내 설명"}
  ],
  "urgencyText": "20자 이내, 정중한 행동 촉구"
}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) return FALLBACK_PITCH

    const parsed = JSON.parse(jsonMatch[0]) as QuotePitch
    if (!parsed.headline || !parsed.reasons?.length || !parsed.cleaningFacts?.length) return FALLBACK_PITCH

    return parsed
  } catch (e) {
    console.error('[AI] quote-pitch 생성 실패', e)
    return FALLBACK_PITCH
  }
}
