import { describe, it, expect } from 'vitest'
import { quoteRefund } from '@/lib/payments/refund-calc'

// 환불 금액은 분쟁이 붙는 숫자다. 약관 제6조의 규칙을 여기서 고정한다.
// 규칙을 바꾸려면 약관(app/terms/page.tsx 제6조)을 먼저 바꾸고 이 테스트를 함께 고칠 것.

const START = '2026-08-01T00:00:00+09:00'
const END = '2026-08-31T00:00:00+09:00' // 30일 이용기간
const PAID = 49_000

describe('quoteRefund — 청약철회(7일 이내 미사용)', () => {
  it('결제 3일 뒤 미사용이면 전액 환불', () => {
    const q = quoteRefund({
      paidAmount: PAID, periodStart: START, periodEnd: END,
      hasUsage: false, now: new Date('2026-08-04T00:00:00+09:00'),
    })
    expect(q.kind).toBe('full_withdrawal')
    expect(q.amount).toBe(PAID)
  })

  it('딱 7일째 미사용도 전액 (경계 포함)', () => {
    const q = quoteRefund({
      paidAmount: PAID, periodStart: START, periodEnd: END,
      hasUsage: false, now: new Date('2026-08-08T00:00:00+09:00'),
    })
    expect(q.kind).toBe('full_withdrawal')
    expect(q.amount).toBe(PAID)
  })

  it('8일째면 미사용이라도 일할 계산으로 넘어간다', () => {
    const q = quoteRefund({
      paidAmount: PAID, periodStart: START, periodEnd: END,
      hasUsage: false, now: new Date('2026-08-09T00:00:00+09:00'),
    })
    expect(q.kind).toBe('prorated')
    expect(q.amount).toBeLessThan(PAID)
  })
})

describe('quoteRefund — 일할 계산(이용 내역 있음)', () => {
  it('30일 중 10일 썼으면 남은 20일치', () => {
    const q = quoteRefund({
      paidAmount: PAID, periodStart: START, periodEnd: END,
      hasUsage: true, now: new Date('2026-08-11T00:00:00+09:00'),
    })
    expect(q.kind).toBe('prorated')
    expect(q.usedDays).toBe(10)
    expect(q.remainingDays).toBe(20)
    // 49,000 × 20/30 = 32,666.67 → 고객에게 유리하게 올림
    expect(q.amount).toBe(32_667)
  })

  it('7일 이내라도 이용 내역이 있으면 일할 계산', () => {
    const q = quoteRefund({
      paidAmount: PAID, periodStart: START, periodEnd: END,
      hasUsage: true, now: new Date('2026-08-03T00:00:00+09:00'),
    })
    expect(q.kind).toBe('prorated')
    expect(q.amount).toBeLessThan(PAID)
  })

  it('기간이 다 끝났으면 환불액 0원', () => {
    const q = quoteRefund({
      paidAmount: PAID, periodStart: START, periodEnd: END,
      hasUsage: true, now: new Date('2026-09-05T00:00:00+09:00'),
    })
    expect(q.remainingDays).toBe(0)
    expect(q.amount).toBe(0)
  })

  it('환불액이 결제액을 넘지 않는다', () => {
    const q = quoteRefund({
      paidAmount: PAID, periodStart: START, periodEnd: END,
      hasUsage: true, now: new Date('2026-07-20T00:00:00+09:00'), // 결제 전 시각(비정상 입력)
    })
    expect(q.amount).toBeLessThanOrEqual(PAID)
  })
})

describe('quoteRefund — 회사 귀책', () => {
  it('서비스 장애·중복 결제는 이용 내역·기간과 무관하게 전액', () => {
    const q = quoteRefund({
      paidAmount: PAID, periodStart: START, periodEnd: END,
      hasUsage: true, companyFault: true,
      now: new Date('2026-08-25T00:00:00+09:00'),
    })
    expect(q.kind).toBe('full_company_fault')
    expect(q.amount).toBe(PAID)
  })
})
