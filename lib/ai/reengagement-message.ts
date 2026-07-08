import Anthropic from '@anthropic-ai/sdk'

interface ReengagementInput {
  businessName: string
  customerName: string
  lastService: string | null   // 지난 서비스명
  monthsSince: number          // 경과 개월
  memo: string | null          // 현장 메모(있으면 자연스럽게 반영)
}

// 재방문 유도 개인화 문구 — 채널 중립(카톡/문자 어디든 그대로 사용 가능)
// AI 실패·키 없음 시에도 항상 쓸 수 있는 폴백 문구를 반환한다.
export async function generateReengagementMessage(input: ReengagementInput): Promise<string> {
  const { businessName, customerName, lastService, monthsSince, memo } = input

  const fallback = `${customerName}님, ${businessName}입니다 :) 지난번 ${lastService ?? '청소'} 이용하신 지 ${monthsSince}개월이 지났어요. 다시 깨끗하게 관리해 드리고 싶은데, 편하실 때 편하게 연락 주세요!`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fallback

  const client = new Anthropic({ apiKey })
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `당신은 한국 청소업체 사장님이 예전 고객에게 보내는 '재방문 안내' 문자를 쓰는 카피라이터입니다.
아래 정보로 짧고 진심 어린 카톡/문자 문구 1개만 작성하세요.

업체명: ${businessName}
고객명: ${customerName}
지난 서비스: ${lastService ?? '청소'}
지난 이용 후 경과: ${monthsSince}개월
현장 메모(있으면 자연스럽게 녹이고, 없으면 무시): ${memo?.trim() || '없음'}

규칙:
- 2~3문장, 120자 내외. 존댓말, 친근하지만 정중하게.
- 고객명으로 시작하고, 지난 서비스·경과 시점을 언급해 '고객을 기억하는' 느낌을 줄 것.
- 현장 메모가 있으면 그 맥락을 살짝 반영(예: 특정 공간·반려동물·곰팡이 등). 없으면 억지로 만들지 말 것.
- 과장·공포 마케팅·이모지 남발 금지. 부담 없는 재방문 제안으로 마무리.
- 오직 문구 텍스트만 출력(따옴표·머리말·설명 없이).`,
        },
      ],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    return text || fallback
  } catch (e) {
    console.error('[Reengagement] 문구 생성 실패:', e)
    return fallback
  }
}
