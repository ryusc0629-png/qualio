import Anthropic from '@anthropic-ai/sdk'

export interface ServiceTierItems {
  good: string[]    // 기본 플랜 항목
  better: string[]  // 추천 플랜 '추가' 항목 (기본에 더해짐)
  best: string[]    // 프리미엄 플랜 '추가' 항목 (추천에 더해짐)
}

interface Input {
  name: string
  category: string | null
  basePrice: number
  unit: string
}

// 서비스 '하나'를 기본/추천/프리미엄 3단계로 나눌 때 각 단계의 실제 작업 항목 제안.
// — 사장님이 한 서비스 항목에 대해 개별로 추천받고 그 자리에서 수정할 수 있게 한다.
export async function recommendServiceTierItems(input: Input): Promise<ServiceTierItems> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('[APP] AI 기능을 사용하려면 API 키가 필요합니다')

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    messages: [
      {
        role: 'user',
        content: `당신은 한국 청소 서비스 견적 구성 전문가입니다.
아래 '한 가지 서비스'를 기본/추천/프리미엄 3단계로 나눌 때, 각 단계에 들어갈 실제 작업 항목을 제안하세요.

서비스명: ${input.name}
분류: ${input.category ?? '기타'}
기본가격: ${input.basePrice.toLocaleString()}원/${input.unit}

규칙:
- good(기본): 이 서비스의 가장 핵심 작업 2~3개
- better(추천): 기본에 "추가"로 더해질 작업 2~3개 (기본 항목 반복 금지)
- best(프리미엄): 추천에 "추가"로 더해질 작업 1~2개 (앞 단계 반복 금지)
- 각 항목은 짧은 명사형으로 ("필터 세척" O / "필터를 세척합니다" X)
- 실제 ${input.name}에 맞는 현실적인 작업만 제안. 없는 작업을 지어내지 말 것.

반드시 아래 JSON 형식으로만 응답하세요:
{"good":["..."],"better":["..."],"best":["..."]}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('JSON not found')
    const parsed = JSON.parse(m[0]) as ServiceTierItems
    const clean = (arr: unknown): string[] =>
      Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()) : []
    return { good: clean(parsed.good), better: clean(parsed.better), best: clean(parsed.best) }
  } catch (e) {
    console.error('[AI] 서비스 플랜 항목 추천 파싱 실패:', e, text)
    throw new Error('[APP] 추천 생성에 실패했어요. 다시 시도해 주세요')
  }
}
