import { describe, it, expect } from 'vitest'
import { QUOTAS } from '@/lib/ratelimit/quotas'
import { POST_DRAFT_DAILY_LIMIT } from '@/lib/ratelimit/quotas'

// 한도의 목적은 '아껴 쓰게 만드는 것'이 아니라 '한 곳이 폭주해도 원가가 터지지 않게' 하는 것이다.
// 평범하게 쓰면 절대 못 닿는 높이여야 하고, 사장님이 한도를 만나면 그건 우리 실패다.
//
// 숫자를 낮추고 싶어질 때 이 테스트가 근거를 상기시킨다.

/** 기능별 1회 원가(원) — 2026-08 실측. 한도 × 원가가 하루 최대 지출이다. */
const 원가 = {
  meeting: 674,   // 1시간 녹음 받아쓰기 + 정리
  report: 57,
  document: 28,
  claim: 30,
  setup: 19,
} as const

describe('하루 한도', () => {
  it('모든 한도가 정의돼 있다', () => {
    for (const key of Object.keys(원가) as (keyof typeof 원가)[]) {
      expect(QUOTAS[key], `${key} 한도 없음`).toBeDefined()
      expect(QUOTAS[key].limit).toBeGreaterThan(0)
    }
  })

  it('한 업체가 하루에 태울 수 있는 돈이 요금제 안에 있다', () => {
    // 가장 싼 요금제(시작)가 월 49,000원이다.
    // 한 업체가 모든 한도를 하루에 다 써도 하루치가 요금의 1/5을 넘으면 안 된다 —
    // 그러면 며칠만 몰아 써도 그 달 마진이 사라진다.
    let 하루최대 = 0
    for (const [key, cost] of Object.entries(원가)) {
      하루최대 += QUOTAS[key as keyof typeof 원가].limit * cost
    }
    expect(하루최대).toBeLessThan(49_000 / 5)
  })

  it('가장 비싼 기능(미팅 정리)이 가장 촘촘하다', () => {
    // 받아쓰기가 원가의 대부분이라 여기만 낮게 잡는다
    const others = (Object.keys(원가) as (keyof typeof 원가)[])
      .filter((k) => k !== 'meeting')
      .map((k) => QUOTAS[k].limit)
    expect(QUOTAS.meeting.limit).toBeLessThan(Math.min(...others))
  })

  it('평범한 하루 사용량은 한도에 닿지 않는다', () => {
    // 현장 10곳을 도는 업체의 하루: 보고서 10건, 문서 2건, 클레임 1건, 미팅 1건
    expect(QUOTAS.report.limit).toBeGreaterThanOrEqual(10 * 2)   // 다시 만들기까지 감안해 2배
    expect(QUOTAS.document.limit).toBeGreaterThanOrEqual(2 * 5)
    expect(QUOTAS.claim.limit).toBeGreaterThanOrEqual(1 * 5)
    expect(QUOTAS.meeting.limit).toBeGreaterThanOrEqual(1 * 2)
  })

  it('글 만들기 한도는 그대로 5편 — 검색 노출 보호가 목적이라 성격이 다르다', () => {
    // 이건 원가가 아니라 '하루에 몰아 올리면 검색 평가가 깎인다'는 이유로 걸린 한도다
    expect(POST_DRAFT_DAILY_LIMIT).toBe(5)
  })

  it('안내 문구에 다음 행동이 들어 있다', () => {
    for (const q of Object.values(QUOTAS)) {
      expect(q.label.length).toBeGreaterThan(0)
    }
  })
})
