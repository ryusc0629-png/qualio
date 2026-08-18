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
