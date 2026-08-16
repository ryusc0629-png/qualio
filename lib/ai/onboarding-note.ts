import 'server-only'
import { getClaude } from '@/lib/ai/client'
import { RESOLUTION_LABEL, type OnboardingItem } from '@/lib/onboarding/types'

// 초도 진단·보고 리포트의 '작업 시방' 문구와 '관리 멘트' 초안을 전문가 데이터 톤으로 작성.
// - specNote: 진단된 문제를 "이렇게 작업하겠습니다"로 정중히 설명
// - managementNote: 앞으로 관리하겠다는 다짐 + 재발 가능성을 정직하게(사람 노화 비유) 전하는 공감 멘트
// 사장님이 그대로/조금 손질해 고객에게 직접 전달하는 초안이다. 실패 시엔 표준 폴백 문구를 준다.

export interface OnboardingNotes {
  specNote: string
  managementNote: string
}

export interface OnboardingNoteInput {
  businessName: string
  customerName: string
  serviceType: string | null
  items: Pick<OnboardingItem, 'space' | 'problem' | 'resolution' | 'result' | 'nextAction'>[]
}

// AI가 없거나 실패해도 항상 쓸 수 있는 표준 문구
function fallbackNotes(input: OnboardingNoteInput): OnboardingNotes {
  const specNote =
    '확인된 부분들은 이번 작업에서 정기청소 범위 안에서 최대한 깨끗하게 정리하겠습니다. ' +
    '범위가 크거나 특수 장비가 필요한 부분은 따로 안내드리겠습니다.'
  const managementNote =
    '이번에 확인된 부분들은 앞으로 정기 관리에서 계속 신경 쓰겠습니다. ' +
    '다만 오래 사용하는 공간은 사람이 나이가 들며 관리가 필요해지는 것처럼 같은 문제가 다시 생길 수 있습니다. ' +
    '그럴 때마다 저희가 먼저 살펴 알려드리고, 함께 깨끗하게 유지해 나가겠습니다.'
  return { specNote, managementNote }
}

export async function generateOnboardingNotes(input: OnboardingNoteInput): Promise<OnboardingNotes> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || input.items.length === 0) return fallbackNotes(input)

  const itemLines = input.items
    .filter((it) => it.space || it.problem)
    .map((it) => `- [${RESOLUTION_LABEL[it.resolution]}] ${it.space || '현장'}: ${it.problem || '점검 필요'}`)
    .join('\n')

  const prompt = `너는 한국의 숙련된 청소업체 사장님이 거래처(고객)에게 초도(첫) 작업 보고를 하며 건네는 말을 대신 써 준다.
업체명: ${input.businessName}
고객: ${input.customerName}
서비스: ${input.serviceType ?? '정기 청소'}

이번에 진단·작업한 항목:
${itemLines}

두 가지 문구를 한국어로 써라.
1) specNote: "이렇게 작업하겠습니다/했습니다"를 정중하고 신뢰감 있게. 3~4문장. 전문성이 느껴지되 어려운 용어는 피한다.
2) managementNote: 마무리 관리 멘트. 앞으로 저희가 평소에 관리하겠다는 다짐 + 같은 문제가 다시 생길 수 있음을 정직하게(예: 사람도 나이가 들며 관리가 필요해지듯) 따뜻하게 전한다. 3~4문장. 고객이 안심하고 신뢰하게.

규칙: 과장·거짓 약속 금지. 사장님이 직접 말하는 1인칭('저희'). 이모지·마크다운 기호 금지. 순수 텍스트.
반드시 아래 JSON만 출력: {"specNote":"...","managementNote":"..."}`

  try {
    const client = getClaude('onboarding-note')
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return fallbackNotes(input)
    const parsed = JSON.parse(match[0]) as Partial<OnboardingNotes>
    const fb = fallbackNotes(input)
    return {
      specNote: (parsed.specNote ?? '').trim() || fb.specNote,
      managementNote: (parsed.managementNote ?? '').trim() || fb.managementNote,
    }
  } catch (e) {
    console.error('[Onboarding] 초안 생성 실패 — 폴백 사용:', e)
    return fallbackNotes(input)
  }
}
