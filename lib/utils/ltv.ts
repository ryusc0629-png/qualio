// 고객 LTV(고객 가치) 계산 — 일회성 완료 예약 합계 + 정기계약 누적
// Jobber/Housecall Pro 방식: 일회성 매출과 계약 매출을 한 숫자로 통합한다.
// 계약 고객이 화면상 가치 0으로 보이던 문제를 해결.

export interface ContractLike {
  contract_price: number
  start_date: string
  end_date: string | null
  status: string
}

// 계약 시작일 ~ (종료일 또는 현재)의 경과 개월 수.
// 이미 시작한 계약은 최소 1개월로 계산해 방금 시작한 계약도 가치에 반영한다.
export function contractMonthsElapsed(startDate: string, endDate: string | null): number {
  const start = new Date(startDate + 'T00:00:00')
  const end = endDate ? new Date(endDate + 'T00:00:00') : new Date()
  if (isNaN(start.getTime()) || end < start) return 0
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return Math.max(1, months)
}

// 계약 누적 매출 합계.
// terminated(해지) 계약은 end_date까지, active/paused 계약은 현재까지 누적한다.
export function contractAccruedRevenue(contracts: ContractLike[]): number {
  return contracts.reduce((sum, c) => {
    const endpoint = c.status === 'terminated' ? c.end_date : null
    return sum + contractMonthsElapsed(c.start_date, endpoint) * (c.contract_price ?? 0)
  }, 0)
}

// 통합 LTV = 일회성 완료 예약 합계 + 계약 누적 매출
export function customerLtv(oneOffTotal: number, contracts: ContractLike[]): number {
  return oneOffTotal + contractAccruedRevenue(contracts)
}
