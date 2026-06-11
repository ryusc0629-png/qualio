import Anthropic from '@anthropic-ai/sdk'

export interface QuotePitchReason {
  emoji: string
  title: string
  description: string
}

export interface CleaningFact {
  number: string
  label: string
  detail: string
}

export interface QuotePitch {
  headline: string
  subheadline: string
  reasons: [QuotePitchReason, QuotePitchReason, QuotePitchReason]
  urgencyText: string
  cleaningFacts: [CleaningFact, CleaningFact, CleaningFact]
  tierReasons: {
    better: string  // 기본 → 추천 업셀 이유 (새집증후군 케어가 지금 필요한 이유)
    best: string    // 추천 → 프리미엄 업셀 이유 (상판연마·마루코팅이 지금 필요한 이유)
  }
}

const FALLBACK_PITCH: QuotePitch = {
  headline: '고객님을 위한 맞춤 클리닝 제안',
  subheadline: '전문 팀이 직접 투입되어 숨은 오염까지 완벽하게 제거합니다',
  reasons: [
    { emoji: '✅', title: '전 항목 직접 시공', description: '하청 없이 숙련된 자사 팀이 처음부터 끝까지 작업합니다' },
    { emoji: '🛡️', title: '3일 무상 재방문', description: '작업 후 미흡한 부분은 3일 이내 추가 비용 없이 재방문합니다' },
    { emoji: '📋', title: '작업 완료 보고서', description: '청소 전·후 사진과 체크리스트를 카카오톡으로 전달합니다' },
  ],
  urgencyText: '지금 바로 예약하고 깔끔한 시작을 만드세요',
  cleaningFacts: [
    { number: '100%', label: '자사 직접 시공', detail: '하청 없는 책임 작업' },
    { number: '3일', label: '무상 A/S', detail: '작업 후 불만족 시' },
    { number: '24시', label: '예약 확정', detail: '빠른 일정 조율' },
  ],
  tierReasons: {
    better: '새 아파트의 벽지·바닥재·접착제에서 발생하는 포름알데히드는 입주 직후가 농도 최고점입니다. 짐이 들어오기 전 지금이 유일한 전문 처리 타이밍입니다. 입주 후에는 가구와 생활용품이 방해해 처리 효율이 크게 떨어집니다.',
    best: '상판 연마와 마루 코팅은 반드시 새것일 때 시공해야 5년 이상 효과가 지속됩니다. 생활 스크래치가 생긴 후 코팅하면 흠집이 코팅 안에 그대로 남고, 연마 효과도 30% 이상 떨어집니다. 입주 청소와 함께 지금 하는 것이 가장 효율적입니다.',
  },
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
이 문서는 이미 견적 폼을 작성한 고객(= 서비스 필요성은 인지한 상태)을 위한 공식 제안서입니다.
"왜 청소가 필요한가"는 설명하지 않습니다. "왜 이 업체의 이 플랜이어야 하는가"에 집중하세요.

고객 상황:
${contextText}

핵심 작성 규칙:
- headline: "고객님을 위한 [상황] 맞춤 제안" 형식 (예: "고객님을 위한 42평 프리미엄 입주 클리닝 제안")
- subheadline: 이 업체 팀이 직접 투입된다는 전문성 강조
- tierReasons.better: 기본 → 추천 업그레이드 이유 — 새집증후군 케어가 '이 고객 상황'에서 지금 당장 필요한 구체적 이유 (2-3문장, 타이밍 강조)
- tierReasons.best: 추천 → 프리미엄 업그레이드 이유 — 상판연마·마루코팅을 지금 함께 해야 하는 구체적 이유 (2-3문장, 비용 효율·타이밍 강조)
- reasons: 이 업체를 신뢰할 수 있는 이유 3가지 (작업 방식, 보증, 편의)
- cleaningFacts: 이 서비스에서 실제로 작업하는 포인트 3가지 (숫자+구체적 설명)
- 블로그 카피, 공포 마케팅 금지

아래 JSON 형식으로만 응답하세요:
{
  "headline": "25자 이내",
  "subheadline": "50자 이내",
  "cleaningFacts": [
    {"number": "숫자+단위", "label": "10자 이내", "detail": "20자 이내"},
    {"number": "숫자+단위", "label": "10자 이내", "detail": "20자 이내"},
    {"number": "숫자+단위", "label": "10자 이내", "detail": "20자 이내"}
  ],
  "tierReasons": {
    "better": "2-3문장, 지금 이 고객 상황에서 새집증후군 케어가 필요한 이유",
    "best": "2-3문장, 상판연마+마루코팅을 지금 함께 해야 하는 이유"
  },
  "reasons": [
    {"emoji": "이모지", "title": "12자 이내", "description": "50자 이내"},
    {"emoji": "이모지", "title": "12자 이내", "description": "50자 이내"},
    {"emoji": "이모지", "title": "12자 이내", "description": "50자 이내"}
  ],
  "urgencyText": "20자 이내"
}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) return FALLBACK_PITCH

    const parsed = JSON.parse(jsonMatch[0]) as QuotePitch
    if (!parsed.headline || !parsed.tierReasons) return FALLBACK_PITCH

    return parsed
  } catch (e) {
    console.error('[AI] quote-pitch 생성 실패', e)
    return FALLBACK_PITCH
  }
}
