import { describe, it, expect } from 'vitest'
import { evaluateSubscription } from '@/lib/payments/subscription-access'

// 페이월 판정 — 여기가 틀리면 돈을 안 낸 사람이 계속 쓰거나, 낸 사람이 잠긴다.
// 눈으로 확인하기 어려운 경계(기간 만료·무기한 계정)를 고정해둔다.

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString()

describe('evaluateSubscription', () => {
  it('구독 행이 없으면 결제가 필요하다', () => {
    const r = evaluateSubscription(null)
    expect(r.allowed).toBe(false)
    expect(r.needsPayment).toBe(true)
    expect(r.isBeta).toBe(true)
  })

  it('무료 베타 플랜은 결제가 필요하다', () => {
    const r = evaluateSubscription({ plan: 'beta', status: 'active', current_period_end: null })
    expect(r.allowed).toBe(false)
    expect(r.isBeta).toBe(true)
    // 베타는 '만료'가 아니라 아직 결제를 안 한 상태
    expect(r.expired).toBe(false)
  })

  it('이용기간이 남은 유료 구독은 통과한다', () => {
    const r = evaluateSubscription({ plan: 'pro', status: 'active', current_period_end: days(10) })
    expect(r.allowed).toBe(true)
    expect(r.needsPayment).toBe(false)
  })

  it('★ status가 active여도 이용기간이 지났으면 막는다 (1회 결제 영구이용 차단)', () => {
    const r = evaluateSubscription({ plan: 'pro', status: 'active', current_period_end: days(-1) })
    expect(r.expired).toBe(true)
    expect(r.allowed).toBe(false)
  })

  it('취소했지만 기간이 남았으면 남은 기간은 쓸 수 있다', () => {
    const r = evaluateSubscription({ plan: 'pro', status: 'cancelled', current_period_end: days(5) })
    expect(r.allowed).toBe(true)
  })

  it('취소 + 기간 만료면 막는다', () => {
    const r = evaluateSubscription({ plan: 'pro', status: 'cancelled', current_period_end: days(-1) })
    expect(r.allowed).toBe(false)
  })

  it('청구 실패(past_due)는 며칠 여유를 주되 오래되면 막는다', () => {
    expect(evaluateSubscription({ plan: 'pro', status: 'past_due', current_period_end: days(-3) }).allowed).toBe(true)
    expect(evaluateSubscription({ plan: 'pro', status: 'past_due', current_period_end: days(-30) }).allowed).toBe(false)
  })

  it('★ 본사가 직접 부여한 무기한 계정(기간 없음)은 잠기지 않는다', () => {
    // 다트클린처럼 결제 없이 수동 부여된 유료 계정 — 기간이 비어 있다
    const r = evaluateSubscription({ plan: 'scale', status: 'active', current_period_end: null })
    expect(r.allowed).toBe(true)
    expect(r.expired).toBe(false)
  })

  it('날짜 값이 깨져 있으면 잠그지 않는다(오차단 방지)', () => {
    const r = evaluateSubscription({ plan: 'pro', status: 'active', current_period_end: '이상한값' })
    expect(r.allowed).toBe(true)
  })
})
