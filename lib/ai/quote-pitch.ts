import Anthropic from '@anthropic-ai/sdk'

export interface QuotePitchReason {
  emoji: string
  title: string
  description: string
}

export interface QuotePitch {
  headline: string
  subheadline: string
  reasons: [QuotePitchReason, QuotePitchReason, QuotePitchReason]
  urgencyText: string
}

const FALLBACK_PITCH: QuotePitch = {
  headline: '전문가가 준비한 맞춤 견적',
  subheadline: '마음에 드시는 플랜을 선택하고 바로 예약하세요',
  reasons: [
    { emoji: '✨', title: '전문가 청소', description: '숙련된 전문가가 꼼꼼하게 청소해 드립니다' },
    { emoji: '⏱️', title: '시간 절약', description: '직접 하기 어려운 청소를 빠르고 효율적으로 해결합니다' },
    { emoji: '🛡️', title: '위생 보장', description: '전문 장비와 친환경 세제로 깨끗하고 안전한 환경을 만듭니다' },
  ],
  urgencyText: '지금 바로 예약하고 깨끗한 공간을 경험하세요',
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
    category ? `고객 업종: ${category}` : '',
    `제공 업체: ${businessName}`,
  ].filter(Boolean).join('\n')

  const prompt = `당신은 한국 청소 서비스의 전환율 최적화 전문가입니다.
고객이 견적을 받은 후 예약으로 전환하도록 설득하는 랜딩 페이지 콘텐츠를 작성하세요.

고객 상황:
${contextText}

규칙:
- 고객의 업종/상황에 구체적으로 맞춘 내용 (일반적 문구 금지)
- 감정적 pain point + 실질적 이익을 함께 자극
- 한국어, 간결하고 임팩트 있게
- 이유 3가지는 서로 다른 관점 (위생, 비용효율, 타이밍 등)

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "headline": "20자 이내, 구체적 상황이 담긴 강렬한 헤드라인",
  "subheadline": "30자 이내, 핵심 이점을 담은 서브헤드라인",
  "reasons": [
    {"emoji": "이모지1개", "title": "10자 이내 제목", "description": "45자 이내 설명"},
    {"emoji": "이모지1개", "title": "10자 이내 제목", "description": "45자 이내 설명"},
    {"emoji": "이모지1개", "title": "10자 이내 제목", "description": "45자 이내 설명"}
  ],
  "urgencyText": "20자 이내 행동 촉구 문구"
}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) return FALLBACK_PITCH

    const parsed = JSON.parse(jsonMatch[0]) as QuotePitch
    if (!parsed.headline || !parsed.reasons?.length) return FALLBACK_PITCH

    return parsed
  } catch (e) {
    console.error('[AI] quote-pitch 생성 실패', e)
    return FALLBACK_PITCH
  }
}
