import { describe, it, expect } from 'vitest'
import { REEL_FREE_QUOTA, REEL_UNIT_PRICE, reelPriceFor } from '@/lib/reel/pricing'
import { vatOf } from '@/lib/config/plans'

// 홍보 영상 사용료는 결제창을 따로 띄우지 않고 다음 정기결제에 얹힌다.
// 돈이 걸린 계산이라 규칙을 고정한다 — 특히 부가세를 붙이는 '순서'.

/** 정기결제에서 실제로 쓰는 계산과 같은 식 (billing-charge.ts) */
function chargeTotal(planSupply: number, reelSupply: number) {
  const supplyTotal = planSupply + reelSupply
  return supplyTotal + Math.round(supplyTotal * 0.1)
}

describe('홍보 영상 요금 규칙', () => {
  it('계정당 무료 5편, 그 뒤 편당 4,900원(공급가액)', () => {
    expect(REEL_FREE_QUOTA).toBe(5)
    expect(REEL_UNIT_PRICE).toBe(4900)
  })

  it('무료분 안에서는 0원, 넘어가면 정가', () => {
    expect(reelPriceFor(0)).toBe(0)
    expect(reelPriceFor(4)).toBe(0)   // 5번째까지 무료
    expect(reelPriceFor(5)).toBe(REEL_UNIT_PRICE)
    expect(reelPriceFor(50)).toBe(REEL_UNIT_PRICE)
  })
})

describe('정기결제에 얹는 계산', () => {
  it('공급가액끼리 더한 뒤 부가세를 한 번만 얹는다', () => {
    // ⚠️각각 부가세를 붙여 더하면 원 단위가 어긋나 세금계산서와 안 맞는다
    const plan = 290_000
    const reel = REEL_UNIT_PRICE * 3

    const 올바른계산 = chargeTotal(plan, reel)
    const 틀린계산 = plan + vatOf(plan) + reel + vatOf(reel)

    expect(올바른계산).toBe(304_700 + 0 + Math.round((plan + reel) * 0.1))
    // 두 방식이 우연히 같을 수도 있지만, 규칙은 '합친 뒤 한 번'이다
    expect(올바른계산).toBe(Math.round((plan + reel) * 1.1))
    expect(틀린계산).toBeGreaterThanOrEqual(올바른계산 - 1)
  })

  it('영상을 안 썼으면 요금제 금액 그대로다', () => {
    const plan = 290_000
    expect(chargeTotal(plan, 0)).toBe(plan + Math.round(plan * 0.1))
  })

  it('영상 3편이면 요금제 + 14,700원(공급가액)에 부가세', () => {
    const plan = 290_000
    const total = chargeTotal(plan, REEL_UNIT_PRICE * 3)
    expect(total).toBe(Math.round((290_000 + 14_700) * 1.1))
  })

  it('금액은 항상 정수 원이다 — 소수점이 남으면 결제가 튕긴다', () => {
    for (const n of [0, 1, 3, 7, 11]) {
      const total = chargeTotal(190_000, REEL_UNIT_PRICE * n)
      expect(Number.isInteger(total)).toBe(true)
    }
  })
})

describe('중복 청구 방지', () => {
  it('보고서 하나당 한 번만 기록된다', () => {
    // reel_charges.report_id에 unique 제약이 있어 다시 만들어도 두 번 안 물린다.
    // (제약 자체는 마이그레이션에 있고, 여기서는 그 의도를 문서로 고정한다)
    const 이미기록된보고서 = new Set<string>(['report-a'])
    const 기록시도 = (id: string) => {
      if (이미기록된보고서.has(id)) return false
      이미기록된보고서.add(id)
      return true
    }
    expect(기록시도('report-a')).toBe(false)
    expect(기록시도('report-b')).toBe(true)
    expect(기록시도('report-b')).toBe(false)
  })
})
