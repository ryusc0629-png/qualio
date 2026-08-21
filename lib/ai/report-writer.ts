import { getClaude, textFrom } from '@/lib/ai/client'

export interface AiReport {
  beforeStatus: string    // 작업 전 상태
  workDetails: string     // 작업 내용
  afterResult: string     // 작업 결과
  additionalNotes: string // 참고사항
  /**
   * 앞으로 손봐야 할 것 — 현장이 적은 메모를 고객이 읽을 문장으로 다듬은 것.
   * 적은 게 없으면 빈 문자열(지어내지 않는다).
   */
  careAdvice: string
  recommendedServices: string[] // 추천 다음 서비스 (서비스명 목록)
}

const FALLBACK: AiReport = {
  beforeStatus: '현장 확인 결과, 전반적으로 청소가 필요한 상태였습니다.',
  workDetails: '각 구역별로 꼼꼼하게 청소 작업을 진행했습니다.',
  afterResult: '모든 구역의 청소가 완료되어 깨끗한 상태로 마무리됐습니다.',
  additionalNotes: '정기적인 관리를 하시면 깨끗한 상태를 오래 유지하실 수 있어요.',
  careAdvice: '',
  recommendedServices: [],
}

/**
 * '앞으로 손봐야 할 것' 한 줄만 고객이 읽을 문장으로 다듬는다.
 *
 * 왜 따로 있나: 일회성 현장은 보고서를 만들 때 같이 다듬지만(generateAiReport),
 * 정기 거래처 현장은 '오늘 한 작업' 자체를 안 받아서 그 경로를 안 탄다.
 * 그런데 이 글은 정기 쪽에서도 월간 보고서에 **그대로 인쇄**된다
 * (app/q/.../monthly-report). 그래서 저장 시점에 한 번 더 걸러준다.
 *
 * ⚠️ 실패하면 원문을 그대로 돌려준다. 현장 직원이 저장을 못 하는 것보다
 *    말투가 거친 문장이 남는 편이 낫다 — 저장을 막는 일은 절대 없어야 한다.
 */
export async function polishCareAdvice(raw: string): Promise<string> {
  const text = raw.trim()
  if (!text) return ''
  if (!process.env.ANTHROPIC_API_KEY) return text

  try {
    const client = getClaude('care-advice')
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `아래는 청소 현장 직원이 '앞으로 손봐야 할 것'에 적은 메모입니다.
이 글은 고객(거래처)이 받는 작업 보고서에 그대로 실립니다. 말투만 다듬어 주세요.

## 규칙
- 친절하고 전문적인 ~요 체. "~해 보임", "~있음", "~함" 같은 메모체를 남기지 마세요
- **원문에 없는 사실·원인·기간·비용을 보태지 마세요.** 문장만 다듬는 것입니다
- 겁주지 말고 담담하게. 지금 당장의 하자가 아니라 '앞으로 지켜볼 것'이라는 톤
- 1~3문장. 다듬은 문장만 출력하고 다른 말은 붙이지 마세요

## 원문
${text}`,
        },
      ],
    })

    const polished = textFrom(response).trim()
    // 빈 응답·이상하게 긴 응답은 믿지 않는다(원문 유지)
    if (!polished || polished.length > text.length * 4 + 200) return text
    return polished
  } catch (e) {
    console.error('[ReportWriter] 관리 안내 다듬기 실패 — 원문 그대로 저장:', e)
    return text
  }
}

export async function generateAiReport(
  workerMemo: string,
  serviceItems?: { name: string; basePrice: number }[],
  /**
   * '앞으로 손봐야 할 것'에 현장이 적은 원문.
   *
   * 왜 여기서 같이 다듬나: 이 글은 고객 문서의 '향후 관리 안내'로 **그대로** 나간다.
   * 다듬지 않으면 위 네 항목은 "~했어요" 존댓말인데 이 칸만 "~해 보임." 메모체라
   * 서류 한 장 안에서 말투가 무너진다. 현장이 적을 내용을 늘리지 않으면서
   * 문장만 우리가 손보는 자리다.
   */
  careAdviceMemo?: string,
): Promise<AiReport> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return FALLBACK

  const client = getClaude('report-writer')

  // 서비스 목록이 있으면 프롬프트에 포함
  // 현장이 '앞으로 손봐야 할 것'에 적은 원문 — 있을 때만 다듬는다.
  // ⛔ 없으면 지어내지 않는다. 이 문장은 고객 문서에 그대로 실리므로
  //    없는 하자를 만들어내면 그대로 거짓말이 되고, 나중에 분쟁의 근거가 된다.
  const careAdviceSection = careAdviceMemo?.trim()
    ? `
## 앞으로 손봐야 할 것 (현장이 적은 원문)
${careAdviceMemo.trim()}

이 내용을 careAdvice에 **고객이 읽을 문장으로** 다듬어 넣으세요.
- 위 말투 규칙 그대로 ~요 체. "~해 보임", "~있음" 같은 메모체를 남기지 마세요
- 원문에 없는 사실·원인·기간·비용을 보태지 마세요. 문장만 다듬는 것입니다
- 겁주지 말고 담담하게. 지금 당장의 하자가 아니라 '앞으로 지켜볼 것'이라는 톤
`
    : ''

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

## ★작업 내용에는 '오늘 끝낸 일'만 적는다
- workDetails에는 **실제로 완료한 작업만** 쓴다. "~가 필요합니다", "~해야 합니다",
  "~를 권장합니다" 같은 앞으로 할 일은 절대 넣지 않는다.
- 직원 메모에 앞으로 할 일이 섞여 있으면(예: "후드 필터 교체 필요") 그 부분은
  workDetails에서 빼고 additionalNotes로 옮겨, 오늘 한 작업과 이어서 적는다.
  (예: "후드 기름때는 제거했지만 필터가 오래돼 교체가 필요해 보입니다")
- 이유: 고객은 이 보고서로 '오늘 무엇을 받았는지'를 확인한다. 완료되지 않은 일이
  작업 내용에 섞이면 한 일이 부풀려 보이고, 나중에 "했다면서 왜 안 됐냐"는 분쟁이 된다.
- 메모에 없는 작업을 지어내지 않는다. 메모가 짧으면 짧은 대로 쓴다.

## 직원 메모
${workerMemo}
${careAdviceSection}${serviceListSection}

## 출력 형식 (JSON)
{
  "beforeStatus": "작업 전 현장에서 확인된 문제점/상태를 구체적으로 설명",
  "workDetails": "어떤 방법과 도구로 어떤 작업을 완료했는지 설명 (완료된 것만)",
  "afterResult": "작업 후 개선된 결과를 구체적으로 설명",
  "additionalNotes": "유지 관리 팁, 그리고 오늘 끝내지 못했거나 앞으로 손봐야 할 부분",
  "careAdvice": "${careAdviceMemo?.trim() ? '위 「앞으로 손봐야 할 것」 메모를 고객이 읽을 문장으로 다듬은 것 (1~3문장)' : '빈 문자열'}",
  "recommendedServices": ["추천할 서비스명1", "추천할 서비스명2"]
}

recommendedServices는 위 서비스 목록에 있는 정확한 이름만 사용하세요. 추천할 서비스가 없으면 빈 배열로 두세요.
JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.`,
      },
    ],
  })

  try {
    // content[0]을 답으로 읽으면 안 된다 — 모델이 생각 블록을 먼저 내보내면 그 자리가 밀려
    // 빈 문자열이 나오고, 호출부는 '실패'가 아니라 조용히 기본 문구로 넘어간다
    const text = textFrom(response)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return FALLBACK

    const parsed = JSON.parse(jsonMatch[0]) as AiReport
    if (!parsed.beforeStatus || !parsed.workDetails || !parsed.afterResult) return FALLBACK
    if (!Array.isArray(parsed.recommendedServices)) parsed.recommendedServices = []
    // 현장이 안 적었으면 빈 값으로 — 모델이 채워 넣었더라도 버린다(지어낸 하자 방지)
    parsed.careAdvice = careAdviceMemo?.trim() ? (parsed.careAdvice ?? '').trim() : ''
    return parsed
  } catch {
    return FALLBACK
  }
}
