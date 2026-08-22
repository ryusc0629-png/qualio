import { describe, it, expect } from 'vitest'
import { computeAmount, describeEmployeeBase, summarizeVisits, type PayrollVisit } from '@/lib/payroll/compute'

const summary = (visitCount: number, hours: number, workDays: number) => ({ visitCount, hours, workDays })

describe('computeAmount — 직원 기본급', () => {
  it('월급은 근무 기록과 상관없이 매달 같은 금액이다', () => {
    // 정기 현장을 맡은 직원은 월급 고정 — 방문이 몇 번이든, 시간 기록이 없어도 금액이 흔들리면 안 된다
    expect(computeAmount('monthly', 2_500_000, summary(0, 0, 0))).toBe(2_500_000)
    expect(computeAmount('monthly', 2_500_000, summary(21, 42, 21))).toBe(2_500_000)
  })

  it('건당은 완료 건수를 곱한다', () => {
    expect(computeAmount('per_visit', 80_000, summary(3, 6.7, 3))).toBe(240_000)
  })

  it('일급은 나간 날 수를 곱한다(하루에 두 현장이어도 하루)', () => {
    expect(computeAmount('daily', 150_000, summary(5, 20, 3))).toBe(450_000)
  })

  it('시급은 도착~마감 기록이 있는 시간만 곱하고 원 단위로 반올림한다', () => {
    expect(computeAmount('hourly', 12_000, summary(3, 6.7, 3))).toBe(80_400)
  })

  it('방식이나 단가가 비면 0원 — 지어내지 않는다', () => {
    expect(computeAmount(null, 10_000, summary(3, 3, 3))).toBe(0)
    expect(computeAmount('monthly', null, summary(3, 3, 3))).toBe(0)
    expect(computeAmount('hourly', 0, summary(3, 3, 3))).toBe(0)
  })
})

describe('summarizeVisits — 급여 재료', () => {
  const visit = (scheduled: string, checkin: string | null, checkout: string | null): PayrollVisit => ({
    id: scheduled,
    scheduled_at: scheduled,
    customer_name: '고객',
    service_address: null,
    checkin_at: checkin,
    checkout_at: checkout,
  })

  it('마감 기록이 없으면 그 방문의 근무시간은 0이다(추정하지 않는다)', () => {
    const s = summarizeVisits([visit('2026-08-06T12:00:00Z', '2026-08-06T12:00:00Z', null)])
    expect(s.hours).toBe(0)
    expect(s.visitCount).toBe(1)
  })

  it('같은 날 두 현장은 근무일수 1일로 센다', () => {
    const s = summarizeVisits([
      visit('2026-08-17T00:00:00Z', null, null), // KST 8/17 09:00
      visit('2026-08-17T05:00:00Z', null, null), // KST 8/17 14:00
    ])
    expect(s.workDays).toBe(1)
    expect(s.visitCount).toBe(2)
  })

  it('KST 기준으로 날짜를 가른다(UTC로 세면 밤 현장이 전날로 밀린다)', () => {
    // UTC 2026-08-06T21:00 = KST 2026-08-07 06:00 → 8월 7일로 세야 한다
    const s = summarizeVisits([
      visit('2026-08-06T12:00:00Z', null, null), // KST 8/6
      visit('2026-08-06T21:00:00Z', null, null), // KST 8/7
    ])
    expect(s.workDays).toBe(2)
  })
})

describe('describeEmployeeBase — 금액이 어떻게 나왔는지', () => {
  it('무엇에 곱한 값인지 사장님이 눈으로 확인할 수 있게 적는다', () => {
    expect(describeEmployeeBase('monthly', 2_500_000, summary(0, 0, 0))).toBe('월급 2,500,000원')
    expect(describeEmployeeBase('per_visit', 80_000, summary(3, 0, 3))).toBe('3건 × 80,000원')
    expect(describeEmployeeBase('daily', 150_000, summary(5, 0, 3))).toBe('3일 × 150,000원')
    expect(describeEmployeeBase('hourly', 12_000, summary(3, 6.7, 3))).toBe('6.7시간 × 12,000원')
  })

  it('단가가 없으면 금액 대신 무엇을 채워야 하는지 말한다', () => {
    expect(describeEmployeeBase(null, null, summary(0, 0, 0))).toBe('급여 방식과 단가를 정해주세요')
  })
})
