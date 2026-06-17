import Anthropic from '@anthropic-ai/sdk'

// 받아쓴 미팅 원문을 노션 회의록 스타일로 요약
// 실패 시 원문을 그대로 반환(요약만 못 하고 기록 자체는 살림)

export async function summarizeMeeting(transcript: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/\s/g, '')
  if (!apiKey || !transcript.trim()) return transcript

  const client = new Anthropic({ apiKey })

  // 요약(Claude) 호출 — 실패해도 받아쓴 원문은 살린다(크레딧 부족/장애 대비)
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `당신은 청소/홈케어 업체 사장님의 영업 미팅 회의록을 정리하는 비서입니다.
아래는 미팅을 녹음해서 받아쓴 원문입니다. 말이 끊기거나 어색한 부분이 있어도 맥락을 파악해 깔끔하게 정리해주세요.

## 정리 규칙
- 친절한 ~요 체 사용
- 영업/계약에 중요한 내용 위주로 (가격, 요구사항, 일정, 고객 반응 등)
- 추측해서 없는 내용을 지어내지 말 것
- 각 항목은 짧고 명확하게

## 출력 형식 (이 형식 그대로, 다른 말 붙이지 말 것)
📌 한 줄 요약
(미팅을 한 문장으로)

💬 핵심 논의 내용
- (항목1)
- (항목2)

✅ 결정 사항
- (정해진 것. 없으면 "특별히 정해진 사항은 없어요")

📋 다음 할 일
- (후속 조치. 없으면 "예정된 후속 조치가 없어요")

## 미팅 원문
${transcript}`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return text.trim() || transcript
  } catch (error) {
    // 요약 실패(크레딧 부족 등) 시 받아쓴 원문이라도 반환해 기록을 살린다
    console.error('[MeetingSummary] 요약 실패, 원문으로 대체:', error instanceof Error ? error.message : error)
    return transcript
  }
}
