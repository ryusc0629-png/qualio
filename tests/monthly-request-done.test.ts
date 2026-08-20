import { describe, it, expect } from 'vitest'
import { buildMonthlySummary } from '@/lib/reports/monthly-summary'

// 거래처 월간 보고서 상단 지표가 우리를 실제보다 나쁘게 보이게 하던 것을 고정한다.
//
// 예전 계산: 요청사항 = 클레임 + 현장 요청(분모) / 처리 = 클레임 중 처리된 것(분자).
// 현장 요청은 처리 여부를 적을 칸이 없어 분자에 못 들어갔고, 그래서 직원이 현장 요청을
// 성실히 적을수록 거래처 눈에는 "요청 10건 · 처리 2건"이 됐다.

const 방문 = {
  id: 'b1',
  scheduled_at: '2026-08-10T01:00:00Z',
  status: 'completed',
  worker_id: null,
}

function summaryOf(requests: { booking_id: string; scheduled_at: string; request: string; done_at?: string | null }[]) {
  return buildMonthlySummary({
    visits: [방문],
    reports: [],
    workerNames: new Map(),
    now: new Date('2026-08-31T00:00:00Z'),
    issues: [],
    requests,
  })
}

describe('현장 요청 처리 표시', () => {
  it('체크한 요청은 처리 건수로 센다', () => {
    const s = summaryOf([
      { booking_id: 'b1', scheduled_at: '2026-08-10T01:00:00Z', request: '탕비실도 부탁드려요', done_at: '2026-08-11T01:00:00Z' },
      { booking_id: 'b2', scheduled_at: '2026-08-20T01:00:00Z', request: '창틀 한 번 봐주세요', done_at: null },
    ])
    expect(s.requests).toHaveLength(2)
    expect(s.requestDoneCount).toBe(1)
    expect(s.requests[0].done).toBe(true)
    expect(s.requests[1].done).toBe(false)
  })

  it('체크를 안 하면 처리 0건 — 지어내지 않는다', () => {
    const s = summaryOf([
      { booking_id: 'b1', scheduled_at: '2026-08-10T01:00:00Z', request: '탕비실도 부탁드려요' },
    ])
    expect(s.requestDoneCount).toBe(0)
  })

  it('분모(요청사항)에 든 것은 분자(처리)에도 들 수 있어야 한다', () => {
    // 상단 지표는 요청사항 = issueCount + requests.length, 처리 = issueResolvedCount + requestDoneCount.
    // 현장 요청만 있고 전부 처리했다면 두 숫자가 같아야 한다 — 예전엔 "3건 · 0건"이 나왔다.
    const 요청 = ['탕비실', '창틀', '주차장'].map((t, i) => ({
      booking_id: `b${i}`,
      scheduled_at: '2026-08-10T01:00:00Z',
      request: t,
      done_at: '2026-08-11T01:00:00Z',
    }))
    const s = summaryOf(요청)
    const 분모 = s.issueCount + s.requests.length
    const 분자 = s.issueResolvedCount + s.requestDoneCount
    expect(분모).toBe(3)
    expect(분자).toBe(3)
  })
})
