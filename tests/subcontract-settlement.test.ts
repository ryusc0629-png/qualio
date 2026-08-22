import { describe, it, expect } from 'vitest'
import {
  computeSettlement,
  splitByVisits,
  settlementSourceKey,
  type RecurringLine,
  type OneOffLine,
} from '@/lib/finance/subcontract-settlement'
import {
  DEFAULT_CONTRACT_DATA,
  type SubcontractorContractData,
} from '@/lib/contract/subcontractor-contract'

const contract = (over: Partial<SubcontractorContractData>): SubcontractorContractData => ({
  ...DEFAULT_CONTRACT_DATA,
  ...over,
})

const rec = (amount: number, visits = 1, monthlyPrice = amount): RecurringLine => ({
  contractId: `c-${amount}-${visits}`,
  clientName: '거래처',
  amount,
  visits,
  monthlyPrice,
})

const one = (amount: number): OneOffLine => ({
  bookingId: `b-${amount}`,
  clientName: '고객',
  amount,
  date: '2026-08-10',
})

describe('splitByVisits — 방문 비율 배분', () => {
  it('합이 항상 총액과 정확히 일치한다(1원도 새지 않음)', () => {
    for (const total of [1_900_000, 350_000, 999_999, 1, 7]) {
      for (const visits of [[1, 1, 1], [21, 1], [3, 5, 7, 11], [1, 0, 2]]) {
        const parts = splitByVisits(total, visits)
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })

  it('방문이 0인 도급사에는 한 푼도 가지 않는다', () => {
    expect(splitByVisits(100_000, [0, 4, 0])).toEqual([0, 100_000, 0])
  })

  it('방문이 아무도 없으면 전부 0', () => {
    expect(splitByVisits(500_000, [0, 0])).toEqual([0, 0])
  })

  it('방문 수가 같으면 균등하게 나눈다', () => {
    expect(splitByVisits(300_000, [1, 1, 1])).toEqual([100_000, 100_000, 100_000])
  })
})

describe('computeSettlement — 매출 배분(2:8)', () => {
  // 다트클린 · 베이스케어 2026-08 실제 조건: 갑 20% / 정기 190만+35만 / 일회성 38만
  const input = {
    contract: contract({ settlementMode: 'revenue_share', sharePercent: 20 }),
    recurring: [rec(1_900_000, 20), rec(350_000, 4)],
    oneOff: [one(200_000), one(180_000)],
  }

  it('정기는 월정액을 한 번만 센다(방문 횟수를 곱하지 않음)', () => {
    const r = computeSettlement(input)
    expect(r.recurringRevenue).toBe(2_250_000)
  })

  it('배분 대상 매출 = 정기 + 일회성', () => {
    expect(computeSettlement(input).revenue).toBe(2_630_000)
  })

  it('갑 20% / 을 80%로 나눈다', () => {
    const r = computeSettlement(input)
    expect(r.ownerShare).toBe(526_000)
    expect(r.contractorPay).toBe(2_104_000)
  })

  it('갑의 몫과 도급비의 합은 항상 매출과 같다(반올림으로 1원도 새지 않음)', () => {
    for (const pct of [0, 7, 20, 33, 50, 77, 100]) {
      for (const amount of [1_000_001, 333_333, 7, 999_999]) {
        const r = computeSettlement({
          contract: contract({ settlementMode: 'revenue_share', sharePercent: pct }),
          recurring: [rec(amount)],
          oneOff: [],
        })
        expect(r.ownerShare + r.contractorPay).toBe(r.revenue)
      }
    }
  })

  it('현장이 없으면 0원이고 막히지 않는다', () => {
    const r = computeSettlement({
      contract: contract({ settlementMode: 'revenue_share', sharePercent: 20 }),
      recurring: [],
      oneOff: [],
    })
    expect(r.revenue).toBe(0)
    expect(r.contractorPay).toBe(0)
    expect(r.blocked).toBeNull()
  })
})

describe('computeSettlement — 계산할 수 없는 경우', () => {
  it('계약서가 없으면 막고 매출만 알려준다', () => {
    const r = computeSettlement({ contract: null, recurring: [rec(500_000)], oneOff: [] })
    expect(r.blocked).toBe('계약서를 먼저 작성해주세요')
    expect(r.revenue).toBe(500_000)
    expect(r.contractorPay).toBe(0)
    expect(r.ownerShare).toBe(0)
  })

  it('배분율이 비어 있으면 막는다', () => {
    const r = computeSettlement({
      contract: contract({ settlementMode: 'revenue_share', sharePercent: null }),
      recurring: [rec(500_000)],
      oneOff: [],
    })
    expect(r.blocked).toBe('계약서에 배분 비율이 없어요')
    expect(r.contractorPay).toBe(0)
  })

  it('배분율이 0~100 밖이면 막는다', () => {
    for (const pct of [-1, 101]) {
      const r = computeSettlement({
        contract: contract({ settlementMode: 'revenue_share', sharePercent: pct }),
        recurring: [rec(100_000)],
        oneOff: [],
      })
      expect(r.blocked).not.toBeNull()
    }
  })

  it('일당 정산은 자동 계산하지 않는다', () => {
    const r = computeSettlement({
      contract: contract({ settlementMode: 'per_day', unitPrice: 150_000 }),
      recurring: [rec(500_000, 5)],
      oneOff: [],
    })
    expect(r.blocked).toContain('일당')
    expect(r.contractorPay).toBe(0)
    expect(r.revenue).toBe(500_000)
  })
})

describe('computeSettlement — 건당 단가', () => {
  it('도급비 = 단가 × 현장 수(정기 방문 + 일회성 건수)', () => {
    const r = computeSettlement({
      contract: contract({ settlementMode: 'per_job', unitPrice: 80_000, sharePercent: null }),
      recurring: [rec(1_000_000, 10)],
      oneOff: [one(300_000), one(200_000)],
    })
    expect(r.jobCount).toBe(12)
    expect(r.contractorPay).toBe(960_000)
    expect(r.revenue).toBe(1_500_000)
    expect(r.ownerShare).toBe(540_000)
  })

  it('단가가 매출보다 크면 내 몫이 음수로 나와 손해가 드러난다', () => {
    const r = computeSettlement({
      contract: contract({ settlementMode: 'per_job', unitPrice: 200_000, sharePercent: null }),
      recurring: [rec(100_000, 2)],
      oneOff: [],
    })
    expect(r.ownerShare).toBeLessThan(0)
  })

  it('단가가 비어 있으면 막는다', () => {
    const r = computeSettlement({
      contract: contract({ settlementMode: 'per_job', unitPrice: null, sharePercent: null }),
      recurring: [rec(100_000)],
      oneOff: [],
    })
    expect(r.blocked).toBe('계약서에 건당 단가가 없어요')
  })
})

describe('computeSettlement — 급여 관리에서 얹은 추가 지급', () => {
  const base = {
    contract: contract({ settlementMode: 'revenue_share', sharePercent: 20 }),
    recurring: [rec(1_000_000, 4)],
    oneOff: [],
  }

  it('배분(도급비)과 추가 지급을 섞지 않는다', () => {
    const r = computeSettlement({ ...base, extras: [{ amount: 150_000 }] })
    expect(r.contractorPay).toBe(800_000) // 배분분은 그대로
    expect(r.extraPay).toBe(150_000)
    expect(r.totalPay).toBe(950_000) // 실제로 나가는 돈
  })

  it('갑의 몫은 추가 지급에 영향받지 않는다(배분은 매출 기준)', () => {
    const r = computeSettlement({ ...base, extras: [{ amount: 500_000 }] })
    expect(r.ownerShare).toBe(200_000)
    expect(r.ownerShare + r.contractorPay).toBe(r.revenue)
  })

  it('추가 지급이 없으면 총 지급액은 도급비와 같다', () => {
    const r = computeSettlement(base)
    expect(r.extraPay).toBe(0)
    expect(r.totalPay).toBe(r.contractorPay)
  })

  it('공제(음수)도 총 지급액에서 빠진다', () => {
    const r = computeSettlement({ ...base, extras: [{ amount: 200_000 }, { amount: -50_000 }] })
    expect(r.totalPay).toBe(950_000)
  })

  it('계약서가 없어 배분이 막혀도 따로 준 돈은 남는다', () => {
    const r = computeSettlement({ contract: null, recurring: [rec(500_000)], oneOff: [], extras: [{ amount: 300_000 }] })
    expect(r.blocked).not.toBeNull()
    expect(r.contractorPay).toBe(0)
    expect(r.totalPay).toBe(300_000)
  })
})

describe('settlementSourceKey', () => {
  it('도급사·달·종류가 다르면 키가 다르다(같으면 덮어쓰기 대상)', () => {
    const a = settlementSourceKey('w1', '2026-08', 'pay')
    expect(a).toBe('subcontract:w1:2026-08:pay')
    expect(settlementSourceKey('w1', '2026-08', 'recurring')).not.toBe(a)
    expect(settlementSourceKey('w1', '2026-09', 'pay')).not.toBe(a)
    expect(settlementSourceKey('w2', '2026-08', 'pay')).not.toBe(a)
  })
})
