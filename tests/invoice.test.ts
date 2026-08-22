import { describe, it, expect } from 'vitest'
import {
  billingMonthLabel,
  buildInvoiceNumber,
  invoiceDueYmd,
  monthEndYmd,
  shiftMonth,
} from '@/lib/quote/invoice'

describe('청구 대상 월 계산', () => {
  it('연도 경계를 넘어도 어긋나지 않는다', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-08', 0)).toBe('2026-08')
  })

  it('말일은 달마다 다르고 윤년도 맞는다', () => {
    expect(monthEndYmd('2026-02')).toBe('2026-02-28')
    expect(monthEndYmd('2028-02')).toBe('2028-02-29')
    expect(monthEndYmd('2026-04')).toBe('2026-04-30')
    expect(monthEndYmd('2026-12')).toBe('2026-12-31')
  })

  it('라벨은 사람이 읽는 말로 나온다', () => {
    expect(billingMonthLabel('2026-08')).toBe('2026년 8월분')
  })
})

describe('입금 기한', () => {
  it('정기는 청구 대상 월의 익월 말일 (표준 계약서 제4조와 같은 말)', () => {
    expect(invoiceDueYmd({ issuedYmd: '2026-08-22', isOneOff: false, billingMonth: '2026-08' }))
      .toBe('2026-09-30')
  })

  it('일회성은 청구일이 속한 달의 말일', () => {
    expect(invoiceDueYmd({ issuedYmd: '2026-08-22', isOneOff: true, billingMonth: '2026-08' }))
      .toBe('2026-08-31')
  })

  it('지난 달치를 늦게 청구해도 기한이 과거가 되지 않는다', () => {
    // 2026년 5월분을 8월에 청구 → 규칙대로면 6/30(이미 지남) → 청구월 말일로 밀어준다
    expect(invoiceDueYmd({ issuedYmd: '2026-08-22', isOneOff: false, billingMonth: '2026-05' }))
      .toBe('2026-08-31')
  })

  it('연말에 다음 해로 넘어가는 기한도 맞는다', () => {
    expect(invoiceDueYmd({ issuedYmd: '2026-12-05', isOneOff: false, billingMonth: '2026-12' }))
      .toBe('2027-01-31')
  })
})

describe('청구번호', () => {
  it('정기는 청구 대상 월이 들어가 매달 서로 다른 번호가 된다', () => {
    const base = { quoteNumber: 'Q-2026-0007', quoteId: 'abcdef12-3456', isOneOff: false }
    expect(buildInvoiceNumber({ ...base, billingMonth: '2026-08' })).toBe('I-202608-0007')
    expect(buildInvoiceNumber({ ...base, billingMonth: '2026-09' })).toBe('I-202609-0007')
  })

  it('일회성은 견적번호에서 그대로 파생된다', () => {
    expect(buildInvoiceNumber({
      quoteNumber: 'Q-2026-0007', quoteId: 'abcdef12-3456', isOneOff: true, billingMonth: '2026-08',
    })).toBe('I-2026-0007')
  })

  it('견적번호가 없는 옛 견적서도 번호가 비지 않는다', () => {
    expect(buildInvoiceNumber({
      quoteNumber: null, quoteId: 'abcdef12-3456', isOneOff: true, billingMonth: '2026-08',
    })).toBe('I-ABCDEF12')
    expect(buildInvoiceNumber({
      quoteNumber: '', quoteId: 'abcdef12-3456', isOneOff: false, billingMonth: '2026-08',
    })).toBe('I-202608-ABCD')
  })
})
