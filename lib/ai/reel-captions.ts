import Anthropic from '@anthropic-ai/sdk'

// 릴스 자막 한 컷 — 흰색 설정줄(top) + 강조색 펀치줄(bottom)
// tone에 따라 펀치줄 색이 결정됨 (problem=빨강, action=노랑, result=초록)
export interface ReelCaption {
  top: string
  bottom: string
  tone: 'problem' | 'action' | 'result'
}

export interface ReelCaptionInput {
  cleaningType: string
  beforeStatus: string
  workDetails: string
  afterResult: string
}

// AI 실패/키 없음 시 사용할 기본 자막 (렌더는 항상 자막을 갖도록)
const FALLBACK_CAPTIONS: ReelCaption[] = [
  { top: '오늘의 현장', bottom: '상태부터 확인', tone: 'problem' },
  { top: '눈에 보이는', bottom: '묵은 때', tone: 'problem' },
  { top: '전문 장비로', bottom: '꼼꼼하게', tone: 'action' },
  { top: '구석구석', bottom: '빠짐없이', tone: 'action' },
  { top: '보세요', bottom: '이 차이', tone: 'result' },
  { top: '믿고 맡기는', bottom: '확실한 결과', tone: 'result' },
]

// 작업 보고서 → 짧은 후킹 자막 (시청 지속 시간을 높이는 핵심)
export async function generateReelCaptions(input: ReelCaptionInput): Promise<ReelCaption[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return FALLBACK_CAPTIONS

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `너는 조회수 높은 청소 비포애프터 릴스의 자막을 쓰는 전문 편집자야.
아래 작업 내용으로, 영상 클립 위에 3초씩 순서대로 띄울 짧은 자막 6개를 만들어줘.

## 자막 규칙 (매우 중요)
- 시청 지속 시간을 높이는 게 목표 — 짧고 리듬감 있게, 다음이 궁금하게
- 각 자막은 2줄: top(설정/맥락) + bottom(강조 펀치)
- 각 줄은 한국어 12자 이내, 최대한 짧게
- 흐름: 문제 제기(처음) → 작업 과정(중간) → 결과/반전(끝)
- 과장·이모지 금지, 청소 사장님이 봐도 자연스럽게
- tone은 각 자막의 성격: "problem"(문제·더러움), "action"(작업·과정), "result"(결과·깨끗)

## 작업 정보
- 서비스: ${input.cleaningType}
- 작업 전 상태: ${input.beforeStatus}
- 작업 내용: ${input.workDetails}
- 작업 결과: ${input.afterResult}

## 출력 형식 (JSON 배열만)
[
  { "top": "설정 줄", "bottom": "강조 펀치", "tone": "problem" },
  ... 총 6개 ...
]
JSON 배열만 출력해. 다른 텍스트는 절대 포함하지 마.`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return FALLBACK_CAPTIONS

    const parsed = JSON.parse(jsonMatch[0]) as ReelCaption[]
    const validTones = ['problem', 'action', 'result']
    const cleaned = parsed
      .filter((c) => c && typeof c.top === 'string' && typeof c.bottom === 'string')
      .map((c) => ({
        top: c.top.slice(0, 20),
        bottom: c.bottom.slice(0, 20),
        tone: validTones.includes(c.tone) ? c.tone : 'action',
      }))

    return cleaned.length >= 3 ? cleaned : FALLBACK_CAPTIONS
  } catch (err) {
    console.error('[ReelCaptions] 자막 생성 실패:', err)
    return FALLBACK_CAPTIONS
  }
}
