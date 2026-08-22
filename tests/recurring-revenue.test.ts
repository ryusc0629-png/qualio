import { describe, it, expect } from 'vitest'
import { monthlyContractValue, sumRecurringRevenue } from '@/lib/utils/recurring-revenue'

// contract_price가 월정액이라는 것 하나를 지키는 테스트.
// 2026-08-22까지 lib/admin/metrics.ts가 여기에 frequency를 곱하고 있어
// 본사 지표의 정기 매출이 17배 부풀어 있었다. 같은 실수가 다시 나오면 여기서 걸린다.

describe('contract_price는 월정액이다', () => {
  it('주 5일 현장이어도 곱하지 않는다', () => {
    // "주 5일 들어간다"는 방문 횟수지 "주에 190만원"이 아니다.
    // 입력 폼 라벨이 '월 계약금액'이고 월간 청구서·매출 집계도 그대로 쓴다.
    expect(monthlyContractValue(1_900_000, '{"type":"weekly","count":5}')).toBe(1_900_000)
  })

  it('월 2회 계약도 곱하지 않는다', () => {
    expect(monthlyContractValue(170_000, '{"type":"monthly","count":2}')).toBe(170_000)
  })

  it('frequency가 없어도 같은 값이다', () => {
    expect(monthlyContractValue(350_000, null)).toBe(350_000)
  })
})

describe('정기 매출 합계', () => {
  const rows = [
    { contract_price: 1_900_000, frequency: '{"type":"weekly","count":5}', status: 'active' },
    { contract_price: 350_000, frequency: '{"type":"weekly","count":1}', status: 'active' },
    { contract_price: 500_000, frequency: null, status: 'ended' },
  ]

  it('운영 DB 실측과 같은 값이 나온다', () => {
    // 다트클린 실제 계약 두 건 — 곱하면 4,127만원이 나왔다
    expect(sumRecurringRevenue(rows)).toBe(2_250_000)
  })

  it('끝난 계약은 빼고 센다 — 요금 근거가 될 수 없다', () => {
    expect(sumRecurringRevenue(rows)).not.toContain(500_000)
    expect(sumRecurringRevenue([{ contract_price: 500_000, frequency: null, status: 'ended' }])).toBe(0)
  })

  it('쉬는 계약(paused)은 살아 있는 것으로 본다', () => {
    expect(sumRecurringRevenue([{ contract_price: 300_000, frequency: null, status: 'paused' }])).toBe(300_000)
  })
})
