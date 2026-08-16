import Anthropic from '@anthropic-ai/sdk'
import * as Sentry from '@sentry/nextjs'

// Claude 호출을 한곳에서 만든다.
// 크레딧 소진·과부하 같은 실패를 사장님이 이해할 수 있는 문구로 바꾸고,
// 진짜 원인은 Sentry로 우리에게만 보낸다.
// (2026-08-16 크레딧 소진으로 자동 작성 기능이 전부 멈췄는데,
//  화면에는 "요청 처리 중 오류가 발생했습니다"만 떠서 원인을 늦게 알았다)

type AiFailure = 'billing' | 'busy' | 'config' | 'unknown'

const MESSAGES: Record<AiFailure, string> = {
  // 사장님이 할 수 있는 일이 없는 경우 — 우리가 고치는 중이라고만 알린다
  billing: '[APP] 자동 작성 기능이 잠시 멈췄어요. 저희가 확인하고 있으니 조금 뒤에 다시 눌러주세요',
  config: '[APP] 자동 작성 기능이 잠시 멈췄어요. 저희가 확인하고 있으니 조금 뒤에 다시 눌러주세요',
  // 기다리면 풀리는 경우 — 다시 누르라고 안내한다
  busy: '[APP] 지금 이용이 몰려서 잠시 밀렸어요. 1~2분 뒤에 다시 눌러주세요',
  unknown: '[APP] 작성에 실패했어요. 다시 한 번 눌러주세요',
}

function classify(e: unknown): AiFailure {
  const status = typeof e === 'object' && e !== null && 'status' in e ? Number((e as { status: unknown }).status) : 0
  const raw = e instanceof Error ? e.message : String(e)
  const msg = raw.toLowerCase()

  if (msg.includes('credit balance') || msg.includes('billing') || msg.includes('quota')) return 'billing'
  if (status === 401 || status === 403 || msg.includes('invalid x-api-key') || msg.includes('authentication')) return 'config'
  if (status === 429 || status === 529 || msg.includes('rate_limit') || msg.includes('overloaded')) return 'busy'
  return 'unknown'
}

/** Claude 호출 실패를 사장님용 문구로 바꾼다. 원인은 Sentry·로그에만 남는다. */
export function toAiAppError(e: unknown, where: string): Error {
  const kind = classify(e)
  console.error(`[AI] ${where} 실패 (${kind}):`, e)

  // 크레딧·키 문제는 서비스 전체가 멈춘 상태라 즉시 알아야 한다
  Sentry.captureException(e, {
    level: kind === 'billing' || kind === 'config' ? 'fatal' : 'error',
    tags: { area: 'ai', ai_failure: kind, ai_where: where },
  })

  return new Error(MESSAGES[kind])
}

/**
 * Claude 클라이언트를 만든다.
 * messages.create / messages.stream 실패는 자동으로 사장님용 문구로 바뀐다.
 * @param where 어떤 기능인지 (Sentry에 남는 이름, 예: 'geo-content')
 */
export function getClaude(where: string): Anthropic {
  // 환경변수에 줄바꿈·공백이 섞여 들어오는 경우가 있어 걷어낸다
  const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/\s/g, '')
  if (!apiKey) throw toAiAppError(new Error('ANTHROPIC_API_KEY 없음'), where)

  const client = new Anthropic({ apiKey })

  const create = client.messages.create.bind(client.messages)
  client.messages.create = (async (...args: Parameters<typeof create>) => {
    try {
      return await create(...args)
    } catch (e) {
      throw toAiAppError(e, where)
    }
  }) as typeof client.messages.create

  const stream = client.messages.stream.bind(client.messages)
  client.messages.stream = ((...args: Parameters<typeof stream>) => {
    const s = stream(...args)
    // 스트림 도중 끊긴 경우도 우리에게 알린다 (호출부는 자체 catch로 화면을 처리)
    s.on('error', (e) => toAiAppError(e, `${where}(스트림)`))
    return s
  }) as typeof client.messages.stream

  return client
}
