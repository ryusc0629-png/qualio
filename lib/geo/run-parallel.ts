// 여러 질문을 동시에 재는 실행기.
//
// 왜 필요한가: 예전엔 질문을 하나씩 순서대로 물었다(질문마다 300~400ms 대기까지).
// 엔진 하나가 질문당 2~5초씩 걸리니 12개만 물어도 2분이 넘었고, 질문을 늘리면
// 함수 제한시간(5분)에 걸려 측정이 통째로 실패했다. 즉 질문을 못 늘린 진짜 이유는
// 돈이 아니라 시간이었다.
//
// 동시에 던지되 한 번에 몇 개까지만 — 무제한으로 열면 API 레이트리밋에 걸린다.
// 실패한 질문은 '노출 안 됨'으로 처리하고 전체는 계속 간다(하나 때문에 측정이 죽지 않게).

/** 한 번에 동시에 던지는 요청 수 */
export const GEO_CONCURRENCY = 5

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function worker() {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

/** 한 번의 API 호출에 허용하는 시간(ms) */
export const GEO_REQUEST_TIMEOUT_MS = 20_000

/**
 * 제한시간이 붙은 fetch.
 *
 * 왜 필요한가: 제한시간 없이 부르면 상대가 응답을 안 줄 때 그대로 매달린다.
 * 실제로 측정 버튼이 5분 내내 돌다가 함수가 죽어 화면이 영영 로딩만 한 적이 있다.
 * 측정은 부가 기능이라, 늦는 건 포기하고 나머지 결과라도 내는 게 맞다.
 */
export function fetchWithTimeout(url: string, init: RequestInit = {}, ms = GEO_REQUEST_TIMEOUT_MS) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
}

/** 이 엔진에 허용하는 전체 시간(ms) — 넘으면 그때까지 결과로 끝낸다.
 *  엔진끼리는 동시에 도니 이 값이 곧 측정 시간의 상한이다(함수 제한은 300초). */
export const GEO_ENGINE_DEADLINE_MS = 240_000

/** 주어진 시간 안에 안 끝나면 fallback을 돌려준다 */
export async function withDeadline<T>(work: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.error(`[GEO] ${label} 제한시간(${Math.round(ms / 1000)}초) 초과 — 여기까지로 끝냅니다`)
      resolve(fallback)
    }, ms)
  })
  try {
    return await Promise.race([work, guard])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
