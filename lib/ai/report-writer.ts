import Anthropic from '@anthropic-ai/sdk'

export interface AiReport {
  beforeStatus: string    // 작업 전 상태
  workDetails: string     // 작업 내용
  afterResult: string     // 작업 결과
  additionalNotes: string // 참고사항
  recommendedServices: string[] // 추천 다음 서비스 (서비스명 목록)
}

const FALLBACK: AiReport = {
  beforeStatus: '현장 확인 결과, 전반적으로 청소가 필요한 상태였습니다.',
  workDetails: '각 구역별로 꼼꼼하게 청소 작업을 진행했습니다.',
  afterResult: '모든 구역의 청소가 완료되어 깨끗한 상태로 마무리됐습니다.',
  additionalNotes: '정기적인 관리를 하시면 깨끗한 상태를 오래 유지하실 수 있어요.',
  recommendedServices: [],
}

export async function generateAiReport(
  workerMemo: string,
  serviceItems?: { name: string; basePrice: number }[],
): Promise<AiReport> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return FALLBACK

  const client = new Anthropic({ apiKey })

  // 서비스 목록이 있으면 프롬프트에 포함
  const serviceListSection = serviceItems && serviceItems.length > 0
    ? `\n## 이 업체가 제공하는 서비스 목록\n${serviceItems.map((s) => `- ${s.name} (${s.basePrice.toLocaleString()}원~)`).join('\n')}\n\n위 서비스 중 현장 상태를 고려했을 때 고객에게 추가로 필요할 수 있는 서비스가 있다면 추천해주세요. 현재 진행한 작업과 동일한 서비스는 제외하세요. 관련 없는 서비스는 추천하지 마세요.`
    : ''

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `당신은 청소/홈케어 전문 업체의 작업 보고서를 작성하는 전문가입니다.
직원이 남긴 간단한 현장 메모를 바탕으로, 고객에게 보낼 전문적이고 친절한 작업 보고서를 작성해주세요.

## 말투 규칙
- 친절하고 전문적인 ~요 체 사용 (예: "진행했어요", "확인됐어요")
- 기술 용어는 쉬운 말로 풀어서 설명
- 고객이 안심할 수 있도록 구체적으로 작성
- 각 항목은 2~4문장으로 간결하게

## 직원 메모
${workerMemo}
${serviceListSection}

## 출력 형식 (JSON)
{
  "beforeStatus": "작업 전 현장에서 확인된 문제점/상태를 구체적으로 설명",
  "workDetails": "어떤 방법과 도구로 어떤 작업을 진행했는지 설명",
  "afterResult": "작업 후 개선된 결과를 구체적으로 설명",
  "additionalNotes": "고객에게 추가로 안내드릴 유지 관리 팁이나 참고사항",
  "recommendedServices": ["추천할 서비스명1", "추천할 서비스명2"]
}

recommendedServices는 위 서비스 목록에 있는 정확한 이름만 사용하세요. 추천할 서비스가 없으면 빈 배열로 두세요.
JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.`,
      },
    ],
  })

  try {
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return FALLBACK

    const parsed = JSON.parse(jsonMatch[0]) as AiReport
    if (!parsed.beforeStatus || !parsed.workDetails || !parsed.afterResult) return FALLBACK
    if (!Array.isArray(parsed.recommendedServices)) parsed.recommendedServices = []
    return parsed
  } catch {
    return FALLBACK
  }
}
