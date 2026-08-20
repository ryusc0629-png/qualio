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

/** 실패 원인을 로그·Sentry에만 남긴다(화면 문구는 만들지 않음). */
function reportAiFailure(e: unknown, where: string): void {
  const kind = classify(e)
  console.error(`[AI] ${where} 실패 (${kind}):`, e)

  // 크레딧·키 문제는 서비스 전체가 멈춘 상태라 즉시 알아야 한다
  Sentry.captureException(e, {
    level: kind === 'billing' || kind === 'config' ? 'fatal' : 'error',
    tags: { area: 'ai', ai_failure: kind, ai_where: where },
  })
}

/** 사장님 화면에 띄울 문구로만 바꾼다(보고는 하지 않음 — 이미 보고한 뒤에 쓴다). */
function aiUserError(e: unknown): Error {
  return new Error(MESSAGES[classify(e)])
}

/** Claude 호출 실패를 사장님용 문구로 바꾼다. 원인은 Sentry·로그에만 남는다. */
export function toAiAppError(e: unknown, where: string): Error {
  reportAiFailure(e, where)
  return aiUserError(e)
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
  client.messages.create = ((...args: Parameters<typeof create>) => {
    const original = create(...args)

    // ⛔ async 함수로 감싸지 말 것. SDK의 스트리밍은 내부에서 create(...).withResponse()를 부르는데,
    //    감싸는 순간 평범한 Promise가 되어 그 메서드가 사라진다. 실제로 2026-08-16~08-20 나흘 동안
    //    시방서·상담 챗봇이 "withResponse is not a function"으로 통째로 죽어 있었다.
    //    그래서 원본(APIPromise)을 그대로 두고, 기다리는 경로(then/catch)에서만 문구를 바꾼다.
    const onRejectedDefault = (e: unknown): never => { throw toAiAppError(e, where) }

    return new Proxy(original, {
      get(target, prop) {
        if (prop === 'then') {
          return (
            onFulfilled?: ((v: unknown) => unknown) | null,
            onRejected?: ((r: unknown) => unknown) | null,
          ) => target.then(onFulfilled, (e) => (onRejected ? onRejected(toAiAppError(e, where)) : onRejectedDefault(e)))
        }
        if (prop === 'catch') {
          return (onRejected?: ((r: unknown) => unknown) | null) =>
            target.then(undefined, (e) => (onRejected ? onRejected(toAiAppError(e, where)) : onRejectedDefault(e)))
        }
        // withResponse·asResponse 등 APIPromise 고유 메서드는 원본 그대로 넘긴다
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }) as typeof client.messages.create

  const stream = client.messages.stream.bind(client.messages)
  client.messages.stream = ((...args: Parameters<typeof stream>) => {
    const s = stream(...args)

    // 'error' 리스너가 없으면 스트림 실패가 처리되지 않은 채 떠돈다 — 보고는 여기서 한 번만 한다
    let reported = false
    s.on('error', (e) => { reported = true; reportAiFailure(e, `${where}(스트림)`) })

    // finalMessage()가 원본 오류를 그대로 던지면 화면엔 "요청 처리 중 오류가 발생했습니다"만 떠서
    // 사장님이 무엇을 해야 할지 알 수 없다. 여기서 사장님용 문구로 바꾼다.
    const finalMessage = s.finalMessage.bind(s)
    s.finalMessage = async () => {
      try {
        return await finalMessage()
      } catch (e) {
        if (!reported) reportAiFailure(e, `${where}(스트림)`)
        throw aiUserError(e)
      }
    }

    return s
  }) as typeof client.messages.stream

  return client
}

/**
 * 응답에서 글자만 뽑아낸다.
 *
 * ⚠️ `content[0]`을 곧바로 답으로 읽으면 안 된다. 모델이 생각 블록을 먼저 내보내면
 * 0번 자리가 밀려서 빈 문자열이 나오고, 호출부는 그걸 '실패'가 아니라 '빈 답'으로 받아
 * 조용히 기본값으로 넘어간다. 화면엔 아무 일도 없어 보여서 원인을 늦게 찾는다.
 * (2026-08-21 릴스 대본에서 claude-sonnet-5가 실제로 이랬다. haiku-4-5·sonnet-4-6은
 *  생각 블록을 안 내보내서 지금은 멀쩡하지만, 모델만 올려도 같은 함정에 빠진다.)
 */
export function textFrom(response: { content: { type: string }[] }): string {
  return response.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && 'text' in b)
    .map((b) => b.text)
    .join('\n')
}
