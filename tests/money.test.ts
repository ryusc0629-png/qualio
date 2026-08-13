import { describe, it, expect } from 'vitest'
import { applyLifetimeDiscount } from '@/lib/config/beta'
import { quoteSupplyAmount } from '@/lib/quote/amount'
import { contractAccruedRevenue, contractPriceSegments } from '@/lib/utils/ltv'

// 돈 계산은 틀려도 화면상 티가 잘 안 난다(그냥 그럴듯한 숫자가 나옴).
// 실제로 사고가 났거나 날 뻔했던 지점만 골라 고정한다.

describe('베타 평생 할인', () => {
  it('할인율이 0이면 정가 그대로', () => {
    expect(applyLifetimeDiscount(290_000, 0)).toBe(290_000)
  })

  it('50%면 절반, 10원 단위로 떨어진다', () => {
    expect(applyLifetimeDiscount(49_000, 50)).toBe(24_500)
    expect(applyLifetimeDiscount(290_000, 50)).toBe(145_000)
    expect(applyLifetimeDiscount(490_000, 50)).toBe(245_000)
  })

  it('100%여도 음수가 되지 않는다', () => {
    expect(applyLifetimeDiscount(49_000, 100)).toBe(0)
  })

  it('범위를 벗어난 값이 들어와도 0~정가 사이로 막힌다', () => {
    expect(applyLifetimeDiscount(49_000, 150)).toBe(0)
    expect(applyLifetimeDiscount(49_000, -20)).toBe(49_000)
  })
})

describe('견적서 공급가액(부가세 별도)', () => {
  const base = { total_amount: 0, tax_included: false }

  it('정기계약은 방문 횟수를 곱하지 않는다 (월정액)', () => {
    // 월 100만원짜리 정기청소를 12회로 적어도 매출은 100만원이어야 한다
    const amount = quoteSupplyAmount({
      ...base,
      job_type: 'recurring',
      items: [{ qty: 12, unit_price: 1_000_000 }],
    })
    expect(amount).toBe(1_000_000)
  })

  it('일회성은 수량을 곱한다', () => {
    const amount = quoteSupplyAmount({
      ...base,
      job_type: 'one_off',
      items: [{ qty: 3, unit_price: 200_000 }],
    })
    expect(amount).toBe(600_000)
  })

  it('할인율을 적용한다', () => {
    const amount = quoteSupplyAmount({
      ...base,
      job_type: 'one_off',
      items: [{ qty: 1, unit_price: 1_000_000 }],
      discount_type: 'rate',
      discount_value: 10,
    })
    expect(amount).toBe(900_000)
  })

  it('할인이 소계보다 커도 마이너스가 되지 않는다', () => {
    const amount = quoteSupplyAmount({
      ...base,
      job_type: 'one_off',
      items: [{ qty: 1, unit_price: 100_000 }],
      discount_type: 'amount',
      discount_value: 500_000,
    })
    expect(amount).toBe(0)
  })

  it('항목이 없고 부가세 포함이면 1.1로 나눠 공급가액을 추정한다', () => {
    const amount = quoteSupplyAmount({
      items: [],
      total_amount: 1_100_000,
      tax_included: true,
      job_type: 'one_off',
    })
    expect(amount).toBe(1_000_000)
  })

  it('항목이 없고 부가세 미포함이면 총액 그대로', () => {
    const amount = quoteSupplyAmount({
      items: [],
      total_amount: 1_000_000,
      tax_included: false,
      job_type: 'one_off',
    })
    expect(amount).toBe(1_000_000)
  })
})

describe('정기계약 누적 매출 — 금액 변경 이력', () => {
  // 해지(terminated) 계약만 종료일까지 누적한다. 활성 계약은 '오늘'까지 세므로
  // 날짜가 지나도 값이 흔들리지 않게 여기서는 해지 계약으로 고정해 검증한다.
  it('금액을 올려도 지난 달 매출이 새 금액으로 바뀌지 않는다', () => {
    const contract = {
      contract_price: 1_500_000,
      start_date: '2026-01-01',
      end_date: '2026-07-01',
      status: 'terminated',
      price_history: [
        { from: '2026-01-01', price: 1_000_000 },
        { from: '2026-04-01', price: 1_500_000, note: '진료센터 추가' },
      ],
    }

    const segments = contractPriceSegments(contract)
    expect(segments).toHaveLength(2)

    // 1~3월 3개월 × 100만 + 4~6월 3개월 × 150만 = 750만
    // (전 구간에 새 금액을 적용하면 900만이 되어 과거 매출이 부풀려진다)
    expect(contractAccruedRevenue([contract])).toBe(7_500_000)
  })

  it('이력이 없으면 현재 금액을 전 구간에 적용한다', () => {
    const contract = {
      contract_price: 1_000_000,
      start_date: '2026-01-01',
      end_date: '2026-04-01',
      status: 'terminated',
      price_history: null,
    }
    expect(contractAccruedRevenue([contract])).toBe(3_000_000)
  })

  it('활성 계약은 종료일이 적혀 있어도 오늘까지 누적한다 (해지해야 멈춘다)', () => {
    const dates = { contract_price: 1_000_000, start_date: '2026-01-01', end_date: '2026-04-01', price_history: null }
    const active = contractAccruedRevenue([{ ...dates, status: 'active' }])
    const terminated = contractAccruedRevenue([{ ...dates, status: 'terminated' }])
    expect(active).toBeGreaterThan(terminated)
  })
})
