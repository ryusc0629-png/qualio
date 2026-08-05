import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

// 클레임(고객 불만)이 들어왔을 때 '고객에게 보낼 말'을 응대 3단계로 초안 작성.
// - acknowledge: 즉시 접수·공감(사과 + 바로 확인하겠다는 첫마디) — 화가 커지기 전에 가장 먼저 나갈 말
// - resolve: 어떻게 조치할지 안내
// - closing: 조치 후 마무리 + 재발 방지 다짐(불만을 신뢰로)
// 사장님이 손질해 문자·통화로 직접 전달하는 초안이다(자동 발송 아님). 실패 시 표준 폴백.

export interface ClaimReplies {
  acknowledge: string
  resolve: string
  closing: string
}

export interface ClaimReplyInput {
  businessName: string
  customerName: string
  title: string
  content: string | null
  isUrgent: boolean
}

function fallbackReplies(input: ClaimReplyInput): ClaimReplies {
  const name = input.customerName || '고객'
  return {
    acknowledge:
      `${name}님, 불편을 드려 정말 죄송합니다. 말씀 주신 내용 지금 바로 확인하고 빠르게 조치하겠습니다. 잠시만 기다려 주세요.`,
    resolve:
      `확인해보니 다시 손봐야 할 부분이 있었습니다. 빠른 시일 안에 다시 방문해 작업하겠습니다. 편하신 시간을 알려주시면 그에 맞추겠습니다.`,
    closing:
      `다시 작업을 마쳤습니다. 앞으로 이 부분은 방문마다 한 번 더 꼼꼼히 점검하겠습니다. 혹시 또 신경 쓰이는 곳이 있으면 언제든 편하게 말씀해 주세요.`,
  }
}

export async function generateClaimReplies(input: ClaimReplyInput): Promise<ClaimReplies> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fallbackReplies(input)

  const prompt = `너는 한국의 청소업체 사장님이 불만을 접수한 고객에게 보낼 응대 문구를 대신 써 준다.
업체명: ${input.businessName}
고객: ${input.customerName || '고객'}
불만 제목: ${input.title}
불만 내용: ${input.content ?? '(상세 내용 없음)'}
긴급: ${input.isUrgent ? '예' : '아니오'}

응대 3단계 문구를 한국어로 써라. 각 문구는 그대로 문자로 보내도 될 만큼 완성된 문장.
1) acknowledge: 즉시 접수·공감. 진심 어린 사과 + "바로 확인하겠다"는 첫마디. 방어적이지 않게, 고객 편에서. 2~3문장.
2) resolve: 어떻게 조치할지 안내(재방문/재작업 등). 구체적이되 과한 약속은 피한다. 2~3문장.
3) closing: 조치 후 마무리. 재발 방지 다짐 + 언제든 말해달라는 열린 태도로 신뢰를 남긴다. 2~3문장.

규칙: 1인칭('저희'). 변명·책임회피 금지, 고객 탓 금지. 과장·거짓 약속 금지. 침착하고 따뜻하게. 이모지·마크다운 기호 금지. 순수 텍스트.
반드시 아래 JSON만 출력: {"acknowledge":"...","resolve":"...","closing":"..."}`

  try {
    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return fallbackReplies(input)
    const parsed = JSON.parse(match[0]) as Partial<ClaimReplies>
    const fb = fallbackReplies(input)
    return {
      acknowledge: (parsed.acknowledge ?? '').trim() || fb.acknowledge,
      resolve: (parsed.resolve ?? '').trim() || fb.resolve,
      closing: (parsed.closing ?? '').trim() || fb.closing,
    }
  } catch (e) {
    console.error('[Claim] 응대 초안 생성 실패 — 폴백 사용:', e)
    return fallbackReplies(input)
  }
}
