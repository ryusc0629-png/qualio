import Anthropic from '@anthropic-ai/sdk'

interface TierDescriptionInput {
  serviceName: string
  spaceSize?: number
  goodPrice: number
  betterPrice: number
  bestPrice: number
  goodServices?: string[]    // 기본 플랜에 포함된 서비스 이름 목록
  betterServices?: string[]  // 추천 플랜에 포함된 서비스 이름 목록
  bestServices?: string[]    // 프리미엄 플랜에 포함된 서비스 이름 목록
}

interface TierDescriptions {
  good: string[]
  better: string[]
  best: string[]
}

// 각 플랜(기본/추천/프리미엄)에 대한 AI 설명 생성
// 번들 서비스 목록이 있으면 서비스 기반, 없으면 가격 기반으로 설명 생성
export async function generateTierDescriptions(
  input: TierDescriptionInput
): Promise<TierDescriptions> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[AI] ANTHROPIC_API_KEY가 설정되지 않았습니다')
    return { good: [], better: [], best: [] }
  }

  const client = new Anthropic({ apiKey })
  const sizeText = input.spaceSize ? `${input.spaceSize}평 공간 기준` : ''

  console.log('[AI] tier descriptions 생성 시작:', input.serviceName, sizeText)

  // 번들 서비스 목록이 있으면 서비스 기반 프롬프트, 없으면 가격 기반 프롬프트
  const hasBundles = (input.goodServices?.length ?? 0) > 0

  const bundleContext = hasBundles
    ? `기본 플랜 포함 서비스: ${(input.goodServices ?? []).join(', ')}
추천 플랜 포함 서비스: ${(input.betterServices ?? []).join(', ')}
프리미엄 플랜 포함 서비스: ${(input.bestServices ?? []).join(', ')}`
    : `기본 플랜: ${input.goodPrice.toLocaleString()}원
추천 플랜: ${input.betterPrice.toLocaleString()}원
프리미엄 플랜: ${input.bestPrice.toLocaleString()}원`

  const goodCount = hasBundles ? (input.goodServices?.length ?? 2) : 2
  const betterCount = hasBundles ? (input.betterServices?.length ?? 4) : 4
  const bestCount = hasBundles ? (input.bestServices?.length ?? 6) : 6

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `당신은 청소 서비스 영업 전문가입니다. 고객이 각 플랜의 가치를 이해하고 상위 플랜을 선택하도록 설득력 있게 설명해주세요.

서비스: ${input.serviceName} ${sizeText}
${bundleContext}

작성 규칙:
1. 각 플랜의 실제 서비스 목록만 반영하여 설명합니다 (임의 추가 금지)
2. 형식: "서비스명 — 기대 결과" (예: "입주청소 — 새집처럼 깨끗한 시작")
3. 고객이 즉시 체감할 수 있는 결과 중심으로 작성 (예: "~ 제거", "~ 방지", "~ 완성")
4. 기본 ${goodCount}개 항목, 추천 ${betterCount}개 항목, 프리미엄 ${bestCount}개 항목 (서비스 수와 동일하게)
5. 한 항목은 30자 이내, 쉬운 언어 사용

반드시 아래 JSON 형식으로만 응답하세요:
{
  "good": ["항목1", "항목2"],
  "better": ["항목1", "항목2", "항목3", "항목4"],
  "best": ["항목1", "항목2", "항목3", "항목4", "항목5", "항목6"]
}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  console.log('[AI] 응답 원문:', text)

  // JSON 파싱 실패 시 빈 배열 fallback (AI 오류가 UI를 막으면 안 됨)
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON not found')
    const result = JSON.parse(jsonMatch[0]) as TierDescriptions
    console.log('[AI] 파싱 성공:', result)
    return result
  } catch (e) {
    console.error('[AI] JSON 파싱 실패:', e, '원문:', text)
    return { good: [], better: [], best: [] }
  }
}
