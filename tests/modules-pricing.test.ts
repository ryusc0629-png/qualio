import { describe, it, expect } from 'vitest'
import {
  BASE_PRICE, MODULES, CLIENT_INCLUDED, CLIENT_OVERAGE,
  CARD_BASE, CARD_RATE, ANNUAL_DISCOUNT,
  quoteModules, cardFeeFor, marginOf, type ModuleId,
} from '@/lib/config/modules'

// 요금은 감으로 정하면 나중에 아무도 근거를 못 댄다.
// 여기 적힌 규칙이 값의 근거이고, 숫자를 바꾸고 싶어질 때 왜 그 자리였는지 상기시킨다.

describe('모듈 가격의 근거', () => {
  it('마진이 ServiceTitan 목표 구간(80~90%) 위에 있다', () => {
    for (const id of Object.keys(MODULES) as ModuleId[]) {
      const m = marginOf(id)
      expect(m, `${id} 마진 ${(m * 100).toFixed(1)}%`).toBeGreaterThan(0.8)
      expect(m).toBeLessThan(0.99) // 99%가 넘으면 원가를 잘못 세고 있다는 뜻
    }
  })

  it('현장 Pro는 샤플 Pro(6,300원)보다 비싸다 — 대신 작업 보고서가 고객에게 나간다', () => {
    // 근태만 필요한 업체는 샤플이 싸다. 우리가 싸움을 거는 자리가 아니다.
    expect(MODULES.field.price).toBeGreaterThan(6_300)
    // 다만 2배를 넘으면 설명이 안 된다
    expect(MODULES.field.price).toBeLessThan(6_300 * 2)
  })

  it('거래처 초과 요금은 거래처 1곳 매출(월 70만원)의 1% 미만이다', () => {
    // "거래처 하나 늘면 70만원 버시고 저희는 5,900원 받습니다"가 성립해야 한다
    expect(CLIENT_OVERAGE / 700_000).toBeLessThan(0.01)
  })

  it('마케팅 Pro는 지역당 같은 값이다 — 첫 지역을 깎지 않는다', () => {
    // 대전 글 24편·대전 질문 30개를 새로 만들어야 해서 원가가 한 원도 다르지 않다.
    // 추가 지역을 깎으면 "그럼 울산은 왜 89,000이냐"가 따라온다.
    const one = quoteModules({ regions: 1 }).monthly
    const two = quoteModules({ regions: 2 }).monthly
    expect(two - one).toBe(MODULES.marketing.price)
  })
})

describe('영구 할인은 만들지 않는다', () => {
  it('모듈을 여러 개 골라도 단순 합산이다', () => {
    // 묶음 할인(2개 10%·3개 15%)을 검토했다가 폐지했다 —
    // 할인이 가장 큰 대상이 모듈을 전부 사는 최고 고객이라 ARR을 영구히 깎는다.
    const q = quoteModules({ workers: 5, regions: 1, clients: 10 })
    const expected =
      BASE_PRICE + MODULES.field.price * 5 + MODULES.marketing.price + MODULES.client.price
    expect(q.monthly).toBe(expected)
  })

  it('연 선납만 예외 — 약정을 대가로 주는 할인이라 실사에서 긍정 평가된다', () => {
    const q = quoteModules({ workers: 3 })
    expect(q.annual).toBe(Math.round(q.monthly * 12 * (1 - ANNUAL_DISCOUNT)))
    expect(ANNUAL_DISCOUNT).toBe(0.1)
  })
})

describe('요금 계산', () => {
  it('아무것도 안 고르면 기본만 낸다', () => {
    expect(quoteModules({}).monthly).toBe(BASE_PRICE)
  })

  it('거래처 15곳까지는 추가 요금이 없다', () => {
    expect(quoteModules({ clients: 1 }).monthly).toBe(quoteModules({ clients: CLIENT_INCLUDED }).monthly)
  })

  it('16곳부터 곳당 붙는다', () => {
    const a = quoteModules({ clients: CLIENT_INCLUDED }).monthly
    const b = quoteModules({ clients: CLIENT_INCLUDED + 3 }).monthly
    expect(b - a).toBe(CLIENT_OVERAGE * 3)
  })

  it('직원 수에 비례해 오른다 — 천장이 없다', () => {
    // 지금 3단 플랜의 가장 큰 문제가 직원 3명과 30명이 같은 490,000원이라는 것이었다
    const a = quoteModules({ workers: 3 }).monthly
    const b = quoteModules({ workers: 30 }).monthly
    expect(b).toBeGreaterThan(a * 2)
  })

  it('음수나 소수를 넣어도 깨지지 않는다', () => {
    expect(quoteModules({ workers: -5 }).monthly).toBe(BASE_PRICE)
    expect(quoteModules({ workers: 2.7 }).monthly).toBe(BASE_PRICE + MODULES.field.price * 2)
  })

  it('내역에 계산 근거가 남는다 — 사장님이 왜 이 금액인지 볼 수 있어야 한다', () => {
    const q = quoteModules({ workers: 3, clients: 20 })
    expect(q.lines.find((l) => l.label === '현장 Pro')?.detail).toContain('3명')
    expect(q.lines.find((l) => l.label === '거래처 Pro')?.detail).toContain('5곳')
  })
})

describe('카드 받기', () => {
  it('안 켜면 0원 — 켠 업체만 낸다', () => {
    // 화면에서 안 켰으면 cardFeeFor를 아예 부르지 않는다.
    // 켠 순간부터는 결제가 0원이어도 기본료가 붙는다(고정비가 있는 구조).
    expect(cardFeeFor(0)).toBe(CARD_BASE)
  })

  it('기본료 + 결제액의 0.5%다', () => {
    expect(cardFeeFor(10_000_000)).toBe(CARD_BASE + 50_000)
  })

  it('기본료가 있어야 구독 비중이 지켜진다', () => {
    // 0원 + 1.0%면 변동 매출이 47%까지 올라가 "SaaS라기엔 절반이 변동"으로 읽힌다.
    expect(CARD_BASE).toBeGreaterThan(0)
    expect(CARD_RATE).toBeLessThan(0.01)
  })
})
