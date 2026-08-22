import { getClaude } from '@/lib/ai/client'

interface TierDescriptionInput {
  serviceName: string
  spaceSize?: number
  goodPrice: number
  betterPrice: number
  bestPrice: number
  goodServices?: string[]    // 기본 플랜에 포함된 서비스 이름 목록
  betterServices?: string[]  // 추천 플랜에 포함된 서비스 이름 목록
  bestServices?: string[]    // 프리미엄 플랜에 포함된 서비스 이름 목록
  /**
   * 이 견적이 3단계로 나가는지. false면 기본 플랜 설명만 만든다.
   *
   * ⚠️ 없으면 안 되는 값이다. 3단계를 안 쓰는 업체는 추천·프리미엄 항목이 0개인데
   *    그대로 "추천 0개, 프리미엄 0개로 써라"라고 시키면, 모델이 규칙 1번(실제 목록만
   *    반영)에 걸려 JSON 대신 "정보가 부족합니다"라고 답한다. 그러면 파싱이 깨져
   *    **기본 플랜 설명까지 통째로 빈칸**이 되고, 재시도까지 3번 토큰만 나간다.
   *    (2026-08-16~22 운영 로그에서 실제로 계속 발생 — /biz/[slug] 견적 폼)
   */
  tiersOffered?: boolean
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

  const client = getClaude('tier-descriptions')
  const sizeText = input.spaceSize ? `${input.spaceSize}평 공간 기준` : ''

  console.log('[AI] tier descriptions 생성 시작:', input.serviceName, sizeText)

  // 번들 서비스 목록이 있으면 서비스 기반 프롬프트, 없으면 가격 기반 프롬프트
  const hasBundles = (input.goodServices?.length ?? 0) > 0
  // 3단계를 안 쓰는 견적이면 기본 플랜 하나만 물어본다 (위 tiersOffered 주석 참고)
  const tiersOffered = input.tiersOffered !== false

  const bundleContext = !tiersOffered
    ? `기본 플랜 포함 서비스: ${(input.goodServices ?? []).join(', ')}`
    : hasBundles
      ? `기본 플랜 포함 서비스: ${(input.goodServices ?? []).join(', ')}
추천 플랜 포함 서비스: ${(input.betterServices ?? []).join(', ')}
프리미엄 플랜 포함 서비스: ${(input.bestServices ?? []).join(', ')}`
      : `기본 플랜: ${input.goodPrice.toLocaleString()}원
추천 플랜: ${input.betterPrice.toLocaleString()}원
프리미엄 플랜: ${input.bestPrice.toLocaleString()}원`

  const goodCount = hasBundles ? (input.goodServices?.length ?? 2) : 2
  const betterCount = hasBundles ? (input.betterServices?.length ?? 4) : 4
  const bestCount = hasBundles ? (input.bestServices?.length ?? 6) : 6

  const task = tiersOffered
    ? `당신은 청소 서비스 영업 전문가입니다. 고객이 각 플랜의 가치를 이해하고 상위 플랜을 선택하도록 설득력 있게 설명해주세요.`
    : `당신은 청소 서비스 영업 전문가입니다. 이 견적은 플랜이 하나뿐입니다. 고객이 '이 금액에 무엇이 포함되는지'를 바로 알 수 있게 설명해주세요.`

  const rules = tiersOffered
    ? `4. 기본 ${goodCount}개 항목, 추천 ${betterCount}개 항목, 프리미엄 ${bestCount}개 항목 (서비스 수와 동일하게)`
    : `4. 기본 ${goodCount}개 항목만 씁니다. 추천·프리미엄 플랜은 이 견적에 없으므로 빈 배열로 둡니다`

  const shape = tiersOffered
    ? `{
  "good": ["항목1", "항목2"],
  "better": ["항목1", "항목2", "항목3", "항목4"],
  "best": ["항목1", "항목2", "항목3", "항목4", "항목5", "항목6"]
}`
    : `{
  "good": ["항목1", "항목2"],
  "better": [],
  "best": []
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `${task}

서비스: ${input.serviceName} ${sizeText}
${bundleContext}

작성 규칙:
1. 각 플랜의 실제 서비스 목록만 반영하여 설명합니다 (임의 추가 금지)
2. 형식: "서비스명 — 기대 결과" (예: "입주청소 — 새집처럼 깨끗한 시작")
3. 고객이 즉시 체감할 수 있는 결과 중심으로 작성 (예: "~ 제거", "~ 방지", "~ 완성")
${rules}
5. 한 항목은 30자 이내, 쉬운 언어 사용
6. 정보가 부족해 보여도 되묻지 말고, 주어진 목록만으로 아래 JSON을 반드시 채워 응답합니다

반드시 아래 JSON 형식으로만 응답하세요:
${shape}`,
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
