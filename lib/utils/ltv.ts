// 고객 LTV(고객 가치) 계산 — 일회성 완료 예약 합계 + 정기계약 누적
// Jobber/Housecall Pro 방식: 일회성 매출과 계약 매출을 한 숫자로 통합한다.
// 계약 고객이 화면상 가치 0으로 보이던 문제를 해결.

// 월 계약금액 구간. "이 날짜부터 이 금액" — 범위 추가로 금액이 오르면 구간이 하나 늘어난다.
export interface ContractPriceSegment {
  from: string // 'YYYY-MM-DD' — 이 금액이 적용되기 시작한 날
  price: number
  note?: string | null // 왜 바뀌었는지 (예: '진료센터 추가')
}

export interface ContractLike {
  contract_price: number
  start_date: string
  end_date: string | null
  status: string
  // 금액 변경 이력. 없거나 비어 있으면 contract_price가 전 구간에 적용된 것으로 본다.
  price_history?: ContractPriceSegment[] | null
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

// 두 날짜 사이의 월 경계 수(최소 보정 없음). 구간별 배분에 쓴다.
function monthsBetween(a: string, b: string): number {
  const s = new Date(a + 'T00:00:00')
  const e = new Date(b + 'T00:00:00')
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// 진행 중인 계약의 누적 종료점 = '다음 달 1일'(배타적 경계).
// 오늘을 종료점으로 쓰면 이번 달분이 월 경계를 못 넘어 0개월로 세어진다.
// 정기청소는 이미 이번 달 진행 중이고 월 단위로 청구하므로 이번 달도 한 달로 센다.
function currentPeriodEnd(): string {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return next.toISOString().slice(0, 10)
}

// 계약의 금액 구간 목록. 이력이 없으면 "시작일부터 현재 금액" 한 구간으로 본다.
export function contractPriceSegments(c: ContractLike): ContractPriceSegment[] {
  const raw = Array.isArray(c.price_history) ? c.price_history : []
  const valid = raw.filter(
    (s): s is ContractPriceSegment =>
      Boolean(s) && typeof s.from === 'string' && typeof s.price === 'number',
  )
  if (valid.length === 0) return [{ from: c.start_date, price: c.contract_price ?? 0 }]

  const sorted = [...valid].sort((a, b) => a.from.localeCompare(b.from))
  // 방어: 첫 구간이 계약 시작보다 늦으면 시작일로 당겨 매출 공백을 없앤다.
  // (첫 구간 = 최초 금액이므로 앞으로 당기는 게 맞다. 현재 금액을 앞에 붙이면 소급 왜곡이 된다.)
  if (sorted[0].from > c.start_date) sorted[0] = { ...sorted[0], from: c.start_date }
  return sorted
}

// 특정 날짜에 적용되던 월 금액.
function priceAt(segs: ContractPriceSegment[], dateStr: string): number {
  let price = segs[0].price
  for (const s of segs) {
    if (s.from <= dateStr) price = s.price
    else break
  }
  return price ?? 0
}

// 계약 하나가 [windowStart, 종료 or 현재] 동안 발생시킨 매출.
// windowStart가 null이면 계약 시작일부터(= 전체 누적).
function accrueOne(c: ContractLike, windowStart: string | null): number {
  // 아직 시작 전인 계약은 매출 0 — 이번 달분을 미리 세지 않게 막는다.
  if (c.start_date > todayStr()) return 0

  const endpoint = c.status === 'terminated' ? c.end_date : null
  const endStr = endpoint ?? currentPeriodEnd()
  const startBound = windowStart && windowStart > c.start_date ? windowStart : c.start_date
  if (endStr < startBound) return 0 // 창 시작 전에 끝난 계약

  // 아직 오지 않은 인상 구간은 매출로 세지 않는다(누적 종료점이 다음 달 1일이므로 필요한 방어).
  const segs = contractPriceSegments(c).filter((s) => s.from <= todayStr())
  let total = 0
  let months = 0
  for (let i = 0; i < segs.length; i++) {
    const rawFrom = segs[i].from > startBound ? segs[i].from : startBound
    const rawTo = i + 1 < segs.length ? segs[i + 1].from : endStr
    const to = rawTo < endStr ? rawTo : endStr
    const m = monthsBetween(rawFrom, to)
    if (m <= 0) continue
    months += m
    total += m * (segs[i].price ?? 0)
  }
  // 이미 시작했지만 아직 한 달이 안 된 계약은 1개월치로 센다(기존 동작 유지).
  if (months === 0) return priceAt(segs, todayStr())
  return total
}

// 계약 누적 매출 합계.
// terminated(해지) 계약은 end_date까지, active/paused 계약은 현재까지 누적한다.
export function contractAccruedRevenue(contracts: ContractLike[]): number {
  return contracts.reduce((sum, c) => sum + accrueOne(c, null), 0)
}

// 통합 LTV = 일회성 완료 예약 합계 + 계약 누적 매출
export function customerLtv(oneOffTotal: number, contracts: ContractLike[]): number {
  return oneOffTotal + contractAccruedRevenue(contracts)
}

// 특정 시점(sinceIso, 'YYYY-MM-DD...' 허용) 이후로 계약이 발생시킨 매출.
// 마케팅 성과의 '최근 N개월' 창처럼 기간 한정 집계에 쓴다. 계약 시작이 창보다 이르면
// 창 시작부터로 잘라 누적하고, terminated 계약이 창 이전에 끝났으면 0.
export function contractRevenueSince(contracts: ContractLike[], sinceIso: string): number {
  const since = sinceIso.slice(0, 10)
  return contracts.reduce((sum, c) => sum + accrueOne(c, since), 0)
}
