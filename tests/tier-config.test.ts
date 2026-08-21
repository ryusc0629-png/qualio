import { describe, it, expect } from 'vitest'
import { shouldOfferTiers } from '@/lib/quote/tier-config'

// 설정하지 않은 3단계 견적이 고객에게 나가면 안 된다.
// 규칙을 바꾸려면 이 테스트를 먼저 고칠 것 — 돈이 걸린 판정이다.

describe('shouldOfferTiers — 3단계를 내보내지 않아야 하는 경우', () => {
  it('아무것도 설정 안 했으면 단일 금액', () => {
    expect(shouldOfferTiers({})).toBe(false)
  })

  it('★기본 항목만 적은 경우도 단일 금액 (2026-08-21 실제 사고)', () => {
    // 다트클린 '상업시설 대청소' — 기본에 5개만 적었는데 추천·프리미엄이 자동 생성돼 나갔다
    expect(shouldOfferTiers({
      tier_good_items: ['전 구역 표준 대청소', '공용부·복도·계단 청소', '바닥 흡진', '화장실 세척', '쓰레기 배출'],
      tier_better_items: [],
      tier_best_items: [],
    })).toBe(false)
  })

  it('기본 가격만 넣은 경우도 단일 금액', () => {
    expect(shouldOfferTiers({ tier_good_price: 14000 })).toBe(false)
  })

  it('기본 항목 + 기본 가격을 둘 다 넣어도 단일 금액', () => {
    expect(shouldOfferTiers({
      tier_good_items: ['전 구역 표준 대청소'],
      tier_good_price: 14000,
    })).toBe(false)
  })

  it('빈 배열·null은 설정으로 치지 않는다', () => {
    expect(shouldOfferTiers({
      tier_better_items: [],
      tier_best_items: null,
      tier_better_price: null,
      tier_best_price: null,
    })).toBe(false)
  })
})

describe('shouldOfferTiers — 3단계로 내보내야 하는 경우', () => {
  it('추천에 항목을 넣으면 3단계', () => {
    expect(shouldOfferTiers({ tier_better_items: ['열교환기 세척'] })).toBe(true)
  })

  it('프리미엄에만 항목을 넣어도 3단계', () => {
    expect(shouldOfferTiers({ tier_best_items: ['항균 코팅'] })).toBe(true)
  })

  it('추천 가격만 직접 넣어도 3단계', () => {
    expect(shouldOfferTiers({ tier_better_price: 17000 })).toBe(true)
  })

  it('프리미엄 가격만 직접 넣어도 3단계', () => {
    expect(shouldOfferTiers({ tier_best_price: 21000 })).toBe(true)
  })

  it('기본까지 다 채운 정상 구성은 당연히 3단계', () => {
    expect(shouldOfferTiers({
      tier_good_items: ['전 구역 표준 대청소'],
      tier_better_items: ['열교환기 세척'],
      tier_best_items: ['항균 코팅'],
    })).toBe(true)
  })
})
