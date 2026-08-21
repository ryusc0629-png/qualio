import { getClaude } from '@/lib/ai/client'

// 받아쓴 미팅 원문을 노션 회의록 스타일로 요약
// 실패 시 원문을 그대로 반환(요약만 못 하고 기록 자체는 살림)

// 이 길이 미만이면 요약하지 않고 원문을 그대로 쓴다.
// 짧은 원문(예: 29자)을 요약시키면 없는 내용을 지어내 4단락짜리 회의록을 만들어 버리고,
// 그 지어낸 회의록이 그대로 '견적 자동 채우기'의 입력이 되어 엉뚱한 견적으로 번진다.
const MIN_CHARS_TO_SUMMARIZE = 100

// 모델이 형식 밖에 덧붙이는 사족(예: "⚠️ 원문이 매우 짧아 정확한 정리가 어려워요")을 잘라낸다.
// 회의록은 고객사 서류로도 이어지는 기록이라, 도구가 사용자에게 하는 말이 본문에 섞이면 안 된다.
function stripAsides(text: string): string {
  const lines = text.split('\n')
  const cut = lines.findIndex((line) => {
    const t = line.trim()
    if (!t) return false
    // 구분선 이후 붙는 사족 / 인용부호 사족 / 경고 이모지 사족
    return /^-{3,}$/.test(t) || t.startsWith('>') || t.startsWith('⚠️') || t.startsWith('※')
  })
  return (cut === -1 ? lines : lines.slice(0, cut)).join('\n').trim()
}

export async function summarizeMeeting(transcript: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/\s/g, '')
  const raw = transcript.trim()
  if (!apiKey || !raw) return transcript

  // 정리할 내용이 없을 만큼 짧으면 원문 그대로 — 지어내는 것보다 짧은 사실이 낫다
  if (raw.length < MIN_CHARS_TO_SUMMARIZE) return transcript

  const client = getClaude('meeting-summary')

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

## 이 회의록의 쓰임새
사장님은 이 회의록을 훑어보고 곧바로 견적서를 씁니다.
길게 쓰면 사장님이 읽고 고치는 데 시간만 더 듭니다. 짧고 체계적으로, 대신 견적에 필요한 숫자는 빠짐없이.

## 정리 규칙
- 친절한 ~요 체 사용
- 각 줄은 한 문장, 40자 안팎으로 짧게
- '핵심 논의 내용'은 최대 5줄 — 중요한 것부터. 넘치면 덜 중요한 건 버릴 것
- 인사말·잡담·녹음 테스트 언급은 넣지 말 것
- 추측해서 없는 내용을 지어내지 말 것. 원문에 없으면 그 줄을 아예 빼기
- 아래 정보는 원문에 나왔다면 **반드시 그대로(숫자까지) 남길 것** — 견적서에 그대로 옮겨 적는 값이라 하나라도 빠지면 사장님이 녹음을 다시 들어야 합니다
  · 면적(평·㎡) · 투입 인원 · 청소 주기 · 공간 구성(예: 강의실 6개)
  · 오간 금액 · 작업 일정과 날짜 · 포함/제외 범위(예: 발코니 외부는 제외)
- 지시문·안내 문구·주의사항 같은 사족을 형식 밖에 덧붙이지 말 것

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
    return stripAsides(text) || transcript
  } catch (error) {
    // 요약 실패(크레딧 부족 등) 시 받아쓴 원문이라도 반환해 기록을 살린다
    console.error('[MeetingSummary] 요약 실패, 원문으로 대체:', error instanceof Error ? error.message : error)
    return transcript
  }
}
