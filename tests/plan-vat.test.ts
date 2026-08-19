import { describe, it, expect } from 'vitest'
import { PLANS, vatOf, withVat, formatPriceWithVat } from '@/lib/config/plans'
import { applyLifetimeDiscount } from '@/lib/config/beta'

// 요금표의 금액은 전부 '공급가액(부가세 별도)'이고, 실제 청구는 여기에 10%를 더한 값이다.
// 이 숫자가 어긋나면 결제가 "금액이 올바르지 않습니다"로 튕기거나 세금계산서와 안 맞는다.

describe('부가세 — 정가 기준 실제 청구액', () => {
  it('시작 49,000원 → 53,900원', () => {
    expect(PLANS.starter.price).toBe(49_000)
    expect(vatOf(49_000)).toBe(4_900)
    expect(withVat(49_000)).toBe(53_900)
  })

  it('성장 290,000원 → 319,000원', () => {
    expect(PLANS.pro.price).toBe(290_000)
    expect(withVat(290_000)).toBe(319_000)
  })

  it('확장 490,000원 → 539,000원', () => {
    expect(PLANS.scale.price).toBe(490_000)
    expect(withVat(490_000)).toBe(539_000)
  })

  it('무료(0원)는 부가세도 0', () => {
    expect(withVat(0)).toBe(0)
    expect(formatPriceWithVat(0)).toBe('무료')
  })
})

describe('부가세 — 평생 50% 할인과 함께', () => {
  // ★순서가 중요하다: 할인을 공급가액에 먼저 → 그 결과에 부가세.
  //   부가세를 먼저 더하고 할인하면 세액이 어긋나 세금계산서와 맞지 않는다.
  const RATE = 50

  it('시작: 공급가 24,500 + 세액 2,450 = 26,950원', () => {
    const supply = applyLifetimeDiscount(49_000, RATE)
    expect(supply).toBe(24_500)
    expect(vatOf(supply)).toBe(2_450)
    expect(withVat(supply)).toBe(26_950)
  })

  it('성장: 공급가 145,000 → 159,500원', () => {
    const supply = applyLifetimeDiscount(290_000, RATE)
    expect(supply).toBe(145_000)
    expect(withVat(supply)).toBe(159_500)
  })

  it('확장: 공급가 245,000 → 269,500원', () => {
    const supply = applyLifetimeDiscount(490_000, RATE)
    expect(supply).toBe(245_000)
    expect(withVat(supply)).toBe(269_500)
  })

  it('할인 후 부가세가 할인 전 부가세보다 작다 (순서 뒤집힘 방지)', () => {
    const supply = applyLifetimeDiscount(49_000, RATE)
    expect(vatOf(supply)).toBeLessThan(vatOf(49_000))
  })
})
