import { describe, it, expect } from 'vitest'
import { buildMonthlyCharge, type ChargeContract } from '@/lib/reports/monthly-charge'

// 이 계산이 틀리면 거래처에 나간 보고서의 청구 금액이 틀린다.
// 특히 '지금 금액'과 '그 달 금액'을 헷갈리면 이미 보낸 지난 달 문서의 숫자가 바뀐다.

const base: ChargeContract = {
  id: 'c1c2c3c4-0000',
  service_type: '정기청소',
  frequency: JSON.stringify({ type: 'weekly', count: 5 }),
  contract_price: 1_540_000,
  start_date: '2026-01-05',
  end_date: null,
  status: 'active',
  price_history: null,
}

const ARGS = { customerId: 'ab12cd34-0000', issuedYmd: '2026-09-03' }

describe('이번 달 청구 — 금액', () => {
  it('이력이 없으면 계약 금액을 그대로 쓴다', () => {
    const charge = buildMonthlyCharge({ contracts: [base], billingMonth: '2026-08', ...ARGS })
    expect(charge?.total).toBe(1_540_000)
    expect(charge?.rows[0].label).toBe('정기청소 · 주 5회')
  })

  it('★금액을 올려도 지난 달은 그때 금액으로 남는다 (소급 금지)', () => {
    const raised: ChargeContract = {
      ...base,
      contract_price: 1_800_000,
      price_history: [
        { from: '2026-01-05', price: 1_540_000 },
        { from: '2026-09-01', price: 1_800_000 },
      ],
    }
    expect(buildMonthlyCharge({ contracts: [raised], billingMonth: '2026-08', ...ARGS })?.total)
      .toBe(1_540_000)
    expect(buildMonthlyCharge({ contracts: [raised], billingMonth: '2026-09', ...ARGS })?.total)
      .toBe(1_800_000)
  })

  it('달 중간에 금액이 바뀌면 그 달만 날수로 갈라 더한다', () => {
    const midMonth: ChargeContract = {
      ...base,
      price_history: [
        { from: '2026-01-05', price: 1_540_000 },
        { from: '2026-08-15', price: 1_800_000 },
      ],
    }
    // 1~14일 옛 금액 + 15~31일 새 금액
    expect(buildMonthlyCharge({ contracts: [midMonth], billingMonth: '2026-08', ...ARGS })?.total)
      .toBe(Math.round((1_540_000 * 14) / 31 + (1_800_000 * 17) / 31))
    // 바뀌기 전 달·후 달은 한 금액 그대로
    expect(buildMonthlyCharge({ contracts: [midMonth], billingMonth: '2026-07', ...ARGS })?.total)
      .toBe(1_540_000)
    expect(buildMonthlyCharge({ contracts: [midMonth], billingMonth: '2026-09', ...ARGS })?.total)
      .toBe(1_800_000)
  })

  it('계약이 여러 개면 줄로 나누고 합계를 낸다', () => {
    const second: ChargeContract = { ...base, id: 'd1d2', service_type: '유리창 청소', frequency: 'monthly', contract_price: 300_000, price_history: null }
    const charge = buildMonthlyCharge({ contracts: [base, second], billingMonth: '2026-08', ...ARGS })
    expect(charge?.rows).toHaveLength(2)
    expect(charge?.rows[1].label).toBe('유리창 청소 · 월 1회')
    expect(charge?.total).toBe(1_840_000)
  })
})

describe('이번 달 청구 — 그리지 않아야 할 때', () => {
  it('계약이 없으면 절 자체가 없다', () => {
    expect(buildMonthlyCharge({ contracts: [], billingMonth: '2026-08', ...ARGS })).toBeNull()
  })

  it('그 달에 아직 시작 안 한 계약은 청구하지 않는다', () => {
    const future = { ...base, start_date: '2026-09-01' }
    expect(buildMonthlyCharge({ contracts: [future], billingMonth: '2026-08', ...ARGS })).toBeNull()
  })

  it('그 달 전에 끝난 계약은 청구하지 않는다', () => {
    const ended = { ...base, end_date: '2026-07-31', status: 'terminated' }
    expect(buildMonthlyCharge({ contracts: [ended], billingMonth: '2026-08', ...ARGS })).toBeNull()
  })

  it('금액이 0인 계약은 빈 청구서를 만들지 않는다', () => {
    const free = { ...base, contract_price: 0 }
    expect(buildMonthlyCharge({ contracts: [free], billingMonth: '2026-08', ...ARGS })).toBeNull()
  })
})

describe('이번 달 청구 — 일할 계산', () => {
  it('★달 중간에 시작하면 남은 날수만큼만 청구한다', () => {
    // 9월 4일 시작 → 9월 30일 중 27일. 1,540,000 × 27/30
    const started = { ...base, start_date: '2026-09-04' }
    const charge = buildMonthlyCharge({ contracts: [started], billingMonth: '2026-09', ...ARGS })
    expect(charge?.total).toBe(1_386_000)
    expect(charge?.rows[0].note).toBe('4일 시작 · 30일 중 27일')
  })

  it('시작한 다음 달부터는 한 달 치를 그대로 청구한다', () => {
    const started = { ...base, start_date: '2026-09-04' }
    const charge = buildMonthlyCharge({ contracts: [started], billingMonth: '2026-10', ...ARGS })
    expect(charge?.total).toBe(1_540_000)
    expect(charge?.rows[0].note).toBeUndefined()
  })

  it('달 중간에 끝나면 그날까지만 청구한다', () => {
    // 8월 20일 종료 → 8월 31일 중 20일
    const ending = { ...base, end_date: '2026-08-20' }
    const charge = buildMonthlyCharge({ contracts: [ending], billingMonth: '2026-08', ...ARGS })
    expect(charge?.total).toBe(Math.round((1_540_000 * 20) / 31))
    expect(charge?.rows[0].note).toBe('20일 종료 · 31일 중 20일')
  })

  it('1일에 시작한 달은 일할하지 않는다', () => {
    const started = { ...base, start_date: '2026-09-01' }
    const charge = buildMonthlyCharge({ contracts: [started], billingMonth: '2026-09', ...ARGS })
    expect(charge?.total).toBe(1_540_000)
    expect(charge?.rows[0].note).toBeUndefined()
  })
})

describe('이번 달 청구 — 달 중간에 청소 범위가 늘어난 달', () => {
  // 운영 실제 사례(다트클린 · 닥터홍마취통증의학과의원, 2026-08):
  // 7/31부터 공용부 100만 → 8/10 '진료센터 범위 추가'로 190만.
  // 8월분을 190만 전액으로 청구하면 1~9일치를 과청구한다.
  const scopeAdded: ChargeContract = {
    ...base,
    service_type: '공용부 정기청소',
    contract_price: 1_900_000,
    start_date: '2026-07-31',
    price_history: [
      { from: '2026-07-31', price: 1_000_000 },
      { from: '2026-08-10', price: 1_900_000, note: '진료센터 범위 추가' },
    ],
  }

  it('★바뀌기 전·후를 날수로 갈라 더한다', () => {
    const charge = buildMonthlyCharge({ contracts: [scopeAdded], billingMonth: '2026-08', ...ARGS })
    // 100만 × 9/31 + 190만 × 22/31
    expect(charge?.total).toBe(Math.round((1_000_000 * 9) / 31 + (1_900_000 * 22) / 31))
    expect(charge?.total).toBe(1_638_710)
    expect(charge?.rows[0].note).toBe('1~9일 1,000,000원 · 10~31일 1,900,000원')
  })

  it('범위가 늘기 전 달은 옛 금액 그대로', () => {
    // 7/31 하루만 계약이 살아 있던 달 — 하루치만 청구
    const july = buildMonthlyCharge({ contracts: [scopeAdded], billingMonth: '2026-07', ...ARGS })
    expect(july?.total).toBe(Math.round((1_000_000 * 1) / 31))
  })

  it('범위가 는 다음 달은 한 달 치를 그대로', () => {
    const sep = buildMonthlyCharge({ contracts: [scopeAdded], billingMonth: '2026-09', ...ARGS })
    expect(sep?.total).toBe(1_900_000)
    expect(sep?.rows[0].note).toBeUndefined()
  })
})

describe('이번 달 청구 — 일회성 추가 작업 합산', () => {
  it('★정기 계약 아래에 그 달 추가 작업이 한 줄로 붙는다', () => {
    const charge = buildMonthlyCharge({
      contracts: [base],
      billingMonth: '2026-08',
      ...ARGS,
      oneOffJobs: [{ label: '8월 15일 유리창 청소', amount: 300_000 }],
    })
    expect(charge?.rows).toHaveLength(2)
    expect(charge?.rows[1].label).toBe('8월 15일 유리창 청소')
    expect(charge?.total).toBe(1_840_000)
  })

  it('이미 받은 작업은 애초에 넘어오지 않지만, 0원이 섞여도 줄을 만들지 않는다', () => {
    const charge = buildMonthlyCharge({
      contracts: [base],
      billingMonth: '2026-08',
      ...ARGS,
      oneOffJobs: [{ label: '8월 15일 유리창 청소', amount: 0 }],
    })
    expect(charge?.rows).toHaveLength(1)
    expect(charge?.total).toBe(1_540_000)
  })

  it('계약이 없는 달엔 일회성만으로 월간 청구를 만들지 않는다 (작업 보고서가 청구한다)', () => {
    const charge = buildMonthlyCharge({
      contracts: [],
      billingMonth: '2026-08',
      ...ARGS,
      oneOffJobs: [{ label: '8월 15일 유리창 청소', amount: 300_000 }],
    })
    expect(charge).toBeNull()
  })

  it('사장님이 적은 금액은 합산액도 이긴다', () => {
    const charge = buildMonthlyCharge({
      contracts: [base],
      billingMonth: '2026-08',
      ...ARGS,
      oneOffJobs: [{ label: '8월 15일 유리창 청소', amount: 300_000 }],
      overrideTotal: 1_540_000,
    })
    expect(charge?.total).toBe(1_540_000)
    expect(charge?.autoTotal).toBe(1_840_000)
    expect(charge?.adjusted).toBe(true)
  })
})

describe('이번 달 청구 — 사장님이 직접 적은 금액', () => {
  const started = { ...base, start_date: '2026-09-04' }

  it('★적어둔 금액이 자동 계산값을 이긴다 (업체마다 일할 방식이 다르다)', () => {
    const charge = buildMonthlyCharge({
      contracts: [started], billingMonth: '2026-09', ...ARGS, overrideTotal: 1_400_000,
    })
    expect(charge?.total).toBe(1_400_000)
    expect(charge?.autoTotal).toBe(1_386_000)
    expect(charge?.adjusted).toBe(true)
  })

  it('자동값과 같은 금액을 적으면 고친 것으로 치지 않는다', () => {
    const charge = buildMonthlyCharge({
      contracts: [started], billingMonth: '2026-09', ...ARGS, overrideTotal: 1_386_000,
    })
    expect(charge?.adjusted).toBe(false)
  })

  it('0원으로 적으면 그 달은 청구 절이 나가지 않는다', () => {
    expect(buildMonthlyCharge({
      contracts: [started], billingMonth: '2026-09', ...ARGS, overrideTotal: 0,
    })).toBeNull()
  })
})

describe('이번 달 청구 — 번호와 기한', () => {
  it('청구번호는 거래처·월마다 다르고, 기한은 익월 말일 (계약서 제4조와 같은 말)', () => {
    const aug = buildMonthlyCharge({ contracts: [base], billingMonth: '2026-08', ...ARGS })
    const sep = buildMonthlyCharge({ contracts: [base], billingMonth: '2026-09', ...ARGS })
    expect(aug?.invoiceNo).toBe('I-202608-AB12')
    expect(sep?.invoiceNo).toBe('I-202609-AB12')
    expect(aug?.dueYmd).toBe('2026-09-30')
    expect(sep?.dueYmd).toBe('2026-10-31')
  })

  it('지난 달치를 늦게 청구해도 기한이 과거가 되지 않는다', () => {
    const late = buildMonthlyCharge({
      contracts: [base], billingMonth: '2026-05', customerId: ARGS.customerId, issuedYmd: '2026-09-03',
    })
    expect(late?.dueYmd).toBe('2026-09-30')
  })
})
