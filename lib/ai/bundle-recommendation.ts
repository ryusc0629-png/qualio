import Anthropic from '@anthropic-ai/sdk'

interface ServiceItem {
  id: string
  name: string
  base_price: number
  unit: string
  category: string | null
}

interface BundleRecommendation {
  good: string[]      // service_id 배열
  better: string[]
  best: string[]
  reason: string      // AI 추천 이유 (사장님에게 표시)
}

// 사장님의 서비스 목록을 분석해 3단계 번들 조합 추천
export async function recommendBundles(
  services: ServiceItem[]
): Promise<BundleRecommendation> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[AI] ANTHROPIC_API_KEY가 설정되지 않았습니다')
    throw new Error('[APP] AI 기능을 사용하려면 API 키가 필요합니다')
  }

  const client = new Anthropic({ apiKey })

  const serviceList = services
    .map((s, i) => `${i + 1}. [ID: ${s.id}] ${s.name} — ${s.base_price.toLocaleString()}원/${s.unit}${s.category ? ` (${s.category})` : ''}`)
    .join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `당신은 청소 서비스 영업 전문가입니다. 아래 서비스 목록을 분석해서 고객의 객단가를 높일 수 있는 3단계 번들(기본/추천/프리미엄)을 구성해주세요.

서비스 목록:
${serviceList}

번들 구성 원칙:
- 기본(good): 가장 핵심적인 서비스 1~2개만 포함 (가격 진입장벽 낮게)
- 추천(better): 기본 포함 + 인기 부가서비스 2~3개 추가 (가장 많이 선택될 조합)
- 프리미엄(best): 추천 포함 + 고급 서비스 2~3개 추가 (최대 만족도)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "good": ["서비스ID1", "서비스ID2"],
  "better": ["서비스ID1", "서비스ID2", "서비스ID3", "서비스ID4"],
  "best": ["서비스ID1", "서비스ID2", "서비스ID3", "서비스ID4", "서비스ID5"],
  "reason": "추천 이유를 한 문장으로"
}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON not found')
    return JSON.parse(jsonMatch[0]) as BundleRecommendation
  } catch (e) {
    console.error('[AI] 번들 추천 파싱 실패:', e, text)
    throw new Error('[APP] AI 번들 추천 생성에 실패했습니다')
  }
}
