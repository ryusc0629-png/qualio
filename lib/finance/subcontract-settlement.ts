// 도급 정산 계산 — 도급 계약서의 정산 조건과 현장 금액으로 '갑의 몫'과 '도급비'를 뽑는다.
//
// 왜 분리했나: 이 계산이 틀리면 사장님이 도급사에 실제로 잘못된 금액을 지급한다.
// 화면(도급사 상세·재무 대시보드)과 장부 자동 기입이 같은 함수를 쓰도록 한곳에 모으고
// 자동 테스트(tests/subcontract-settlement.test.ts)로 고정한다.
//
// 핵심 규칙 두 가지:
//  1. 정기청소는 방문마다 금액이 없다(bookings.final_price = 0). 매출은 contracts.contract_price(월정액)에 있고
//     그 달에 살아있는 계약은 월정액을 '한 번만' 센다. 방문 횟수를 곱하면 금액이 몇 배로 뛴다.
//  2. 일회성은 반대로 예약마다 금액이 있고(final_price), 끝난 현장만 센다.

import type {
  SettlementMode,
  SubcontractorContractData,
} from '@/lib/contract/subcontractor-contract'

/** 그 달에 이 도급사가 맡은 정기계약 한 건 */
export interface RecurringLine {
  contractId: string
  clientName: string
  /** 이 도급사에 귀속된 금액(한 계약을 여러 도급사가 나눠 맡으면 방문 비율로 쪼갠 몫) */
  amount: number
  /** 이 도급사가 맡은 그 달 방문 수 */
  visits: number
  /** 계약 월정액 전액 — 화면에서 '전액 중 얼마'인지 보여주기 위해 남긴다 */
  monthlyPrice: number
}

/** 그 달에 이 도급사가 끝낸 일회성 현장 한 건 */
export interface OneOffLine {
  bookingId: string
  clientName: string
  amount: number
  /** KST 'YYYY-MM-DD' */
  date: string
}

export interface SettlementResult {
  mode: SettlementMode | null
  sharePercent: number | null
  /** 정기청소 매출(월정액 합) */
  recurringRevenue: number
  /** 일회성 매출(끝난 현장 합) */
  oneOffRevenue: number
  /** 배분 대상 매출 = 정기 + 일회성 */
  revenue: number
  /** 갑(사장님 업체)의 몫 */
  ownerShare: number
  /** 을(도급사)에게 줄 도급비 */
  contractorPay: number
  /** 건당 정산용 현장 수 (정기 방문 + 일회성 건수) */
  jobCount: number
  /**
   * 배분과 별개로 이 도급사에 더 준(또는 뺀) 금액 합. 급여 관리의 '추가 지급' 줄에서 온다.
   * 어떤 현장은 배분이 아니라 일당으로 주는 경우가 있어 배분 계산과 섞지 않고 따로 센다.
   */
  extraPay: number
  /** 실제로 지급할 총액 = 도급비 + 추가 지급. 장부에는 이 금액이 들어간다 */
  totalPay: number
  /**
   * 자동 계산을 할 수 없는 이유. 값이 있으면 금액(ownerShare·contractorPay)은 0이고
   * 화면은 매출만 보여주며 사장님께 무엇을 채워야 하는지 안내한다.
   */
  blocked: string | null
}

/**
 * 총액을 방문 수 비율로 나눈다. **합이 항상 총액과 정확히 일치**한다(1원도 새거나 늘지 않음).
 *
 * 한 정기계약의 그 달 방문을 두 도급사가 나눠 맡은 경우에 쓴다.
 * 내림으로 배분한 뒤 남는 1원 단위는 소수부가 큰 쪽부터 붙인다.
 */
export function splitByVisits(total: number, visits: number[]): number[] {
  const sum = visits.reduce((a, b) => a + b, 0)
  if (sum <= 0) return visits.map(() => 0)

  const raw = visits.map((v) => (total * v) / sum)
  const out = raw.map((r) => Math.floor(r))
  let remainder = total - out.reduce((a, b) => a + b, 0)

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .filter((x) => visits[x.i] > 0)
    .sort((a, b) => b.frac - a.frac)

  let k = 0
  while (remainder > 0 && order.length > 0) {
    out[order[k % order.length].i] += 1
    remainder -= 1
    k += 1
  }
  return out
}

export interface SettlementInput {
  /** 도급 계약서 저장값 — 없으면 계산 불가(계약서를 먼저 써야 함) */
  contract: SubcontractorContractData | null
  recurring: RecurringLine[]
  oneOff: OneOffLine[]
  /** 급여 관리에서 이 도급사에 따로 얹은 금액(현장 일당·추가 업무 등). 음수면 공제 */
  extras?: { amount: number }[]
}

/**
 * 정산 방식에 따라 갑의 몫과 도급비를 계산한다.
 *
 * - 매출 배분(revenue_share): 도급비 = 매출 - 갑의 몫. 갑의 몫을 먼저 반올림하고 나머지를 도급비로 줘서
 *   두 금액의 합이 항상 매출과 정확히 같다(1원 오차로 사장님이 헷갈리지 않게).
 * - 건당(per_job): 도급비 = 단가 × 현장 수. 갑의 몫은 남는 금액(매출보다 도급비가 크면 음수 = 손해).
 * - 일당(per_day): 출근 일수를 앱이 모르므로 자동 계산하지 않고 매출만 보여준다.
 */
export function computeSettlement(input: SettlementInput): SettlementResult {
  const recurringRevenue = input.recurring.reduce((s, r) => s + r.amount, 0)
  const oneOffRevenue = input.oneOff.reduce((s, r) => s + r.amount, 0)
  const revenue = recurringRevenue + oneOffRevenue
  const jobCount = input.recurring.reduce((s, r) => s + r.visits, 0) + input.oneOff.length
  const extraPay = (input.extras ?? []).reduce((s, e) => s + e.amount, 0)

  const base = {
    recurringRevenue,
    oneOffRevenue,
    revenue,
    jobCount,
    extraPay,
    ownerShare: 0,
    contractorPay: 0,
    totalPay: extraPay,
  }

  const c = input.contract
  if (!c) {
    return { ...base, mode: null, sharePercent: null, blocked: '계약서를 먼저 작성해주세요' }
  }

  if (c.settlementMode === 'revenue_share') {
    const pct = c.sharePercent
    if (pct === null || pct < 0 || pct > 100) {
      return {
        ...base,
        mode: c.settlementMode,
        sharePercent: pct,
        blocked: '계약서에 배분 비율이 없어요',
      }
    }
    const ownerShare = Math.round((revenue * pct) / 100)
    const contractorPay = revenue - ownerShare
    return {
      ...base,
      mode: c.settlementMode,
      sharePercent: pct,
      ownerShare,
      contractorPay,
      totalPay: contractorPay + extraPay,
      blocked: null,
    }
  }

  if (c.settlementMode === 'per_job') {
    if (!c.unitPrice || c.unitPrice <= 0) {
      return {
        ...base,
        mode: c.settlementMode,
        sharePercent: null,
        blocked: '계약서에 건당 단가가 없어요',
      }
    }
    const contractorPay = c.unitPrice * jobCount
    return {
      ...base,
      mode: c.settlementMode,
      sharePercent: null,
      contractorPay,
      totalPay: contractorPay + extraPay,
      ownerShare: revenue - contractorPay,
      blocked: null,
    }
  }

  // 일당 — 투입 인력·일수는 앱에 없는 정보라 사장님이 직접 넣어야 한다
  return {
    ...base,
    mode: c.settlementMode,
    sharePercent: null,
    blocked: '일당 정산은 출근 일수가 필요해서 자동 계산이 안 돼요',
  }
}

/** 장부 자동 기입분을 식별하는 키 — 재확정 시 새 줄 대신 이 줄을 덮어쓴다 */
export function settlementSourceKey(
  workerId: string,
  month: string,
  kind: 'recurring' | 'oneoff' | 'pay',
): string {
  return `subcontract:${workerId}:${month}:${kind}`
}

/** 장부에 넣을 지출 분류 — 도급비는 인건비가 아니라 외주비다 */
export const SUBCONTRACT_EXPENSE_CATEGORY = '외주·도급비'
