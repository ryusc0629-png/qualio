// 월간 작업 보고서에 들어가는 '이번 달 청구' 계산.
//
// 왜 계약에서 가져오나: 정기 거래처의 매달 청구 근거는 견적서가 아니라 계약이다.
// 견적서 금액을 쓰면 8월에 올린 단가가 지난 달 보고서까지 소급돼, 이미 보낸 문서의 숫자가 바뀐다.
// 계약에는 금액 변경 이력이 구간(price_history)으로 남아 있으므로 그 달에 유효했던 금액을 쓴다.
//
// ⚠️ 달 중간에 금액이 바뀐 경우(예: 8/15부터 인상) 그 달은 새 금액으로 본다.
//    lib/utils/ltv.ts의 누적 매출 계산이 같은 규칙(월 경계 기준)이라 두 숫자가 어긋나지 않게 맞춘 것이다.

import { formatFrequency } from '@/lib/utils/frequency'
import { formatAmount } from '@/lib/format/money'
import { buildInvoiceNumber, invoiceDueYmd, monthEndYmd } from '@/lib/quote/invoice'
import type { ContractPriceSegment } from '@/lib/utils/ltv'

export interface ChargeContract {
  id: string
  service_type: string
  frequency: string
  contract_price: number
  start_date: string
  end_date: string | null
  status: string
  price_history?: ContractPriceSegment[] | null
}

export interface ChargeRow {
  /** '정기청소 · 주 5회' */
  label: string
  amount: number
  /** 한 달을 다 채우지 못한 달의 근거 — '9월 4일부터 · 27/30일' */
  note?: string
}

/**
 * 그 달에 이 거래처에서 따로 한 일회성 작업 중 아직 못 받은 건.
 *
 * 왜 월간 청구에 합치나: 정기 거래처에 추가 작업이 생기면 담당자는 청구서를 두 장 받는다.
 * 한 장으로 합쳐야 그대로 결재에 올라간다.
 * ⚠️ 이미 받은 작업은 여기 들어오지 않는다(loadOneOffJobs가 미수만 골라온다) —
 *    작업 직후 청구해 돈이 들어온 건은 월말에 다시 실리면 이중 청구가 된다.
 */
export interface OneOffJob {
  /** '8월 15일 유리창 청소' */
  label: string
  /** 아직 못 받은 금액 */
  amount: number
  /** '총 500,000원 중 200,000원 받음' 처럼 일부만 받은 경우의 근거 */
  note?: string
}

export interface MonthlyCharge {
  rows: ChargeRow[]
  /** 계약 기준 자동 계산 합계 */
  autoTotal: number
  /** 실제 청구 금액 — 사장님이 그 달 금액을 적었으면 그 값 */
  total: number
  /** 사장님이 금액을 직접 적었는가 */
  adjusted: boolean
  /** 'I-202608-A1B2' */
  invoiceNo: string
  /** 입금 기한 'YYYY-MM-DD' */
  dueYmd: string
}

/** 'YYYY-MM-DD'에서 일(day)만 */
function dayOf(ymd: string): number {
  return Number(ymd.slice(8, 10))
}

/** 계약의 금액 구간 — 이력이 없으면 '시작일부터 현재 금액' 한 구간 */
function normalizedSegments(contract: ChargeContract): ContractPriceSegment[] {
  const segments = (Array.isArray(contract.price_history) ? contract.price_history : []).filter(
    (s): s is ContractPriceSegment =>
      Boolean(s) && typeof s.from === 'string' && typeof s.price === 'number',
  )
  if (segments.length === 0) return [{ from: contract.start_date, price: contract.contract_price ?? 0 }]

  const sorted = [...segments].sort((a, b) => a.from.localeCompare(b.from))
  // 첫 구간이 계약 시작보다 늦으면 시작일로 당긴다(ltv.ts와 같은 방어 — 금액 공백 방지)
  if (sorted[0].from > contract.start_date) sorted[0] = { ...sorted[0], from: contract.start_date }
  return sorted
}

/** 하루 전 날짜 — 구간의 끝을 '다음 구간 시작 하루 전'으로 잡는다 */
function prevDayYmd(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** 그 달에 살아 있던 계약인가 — 시작 전이거나 이미 끝난 계약은 청구하지 않는다 */
function wasActiveInMonth(contract: ChargeContract, billingMonth: string): boolean {
  if (contract.status === 'terminated') return false
  const monthStart = `${billingMonth}-01`
  const monthEnd = monthEndYmd(billingMonth)
  if (contract.start_date > monthEnd) return false
  if (contract.end_date && contract.end_date < monthStart) return false
  return true
}

/**
 * 그 달 청구액 — 날짜별로 얼마짜리 계약이었는지를 따라 일할로 더한다.
 *
 * 두 가지를 한 계산으로 처리한다:
 *   · 달 중간 시작·종료  → 그 달에 살아 있던 날수만큼만
 *   · 달 중간 금액 변경  → 바뀌기 전·후를 날수로 갈라 더한다
 *     (실제 사례: 8월 10일 '진료센터 범위 추가'로 100만 → 190만.
 *      8월분을 190만 전액으로 청구하면 1~9일치를 과청구한다)
 *
 * ⚠️ 일할 방식은 업체마다 다르다(일수 · 방문 횟수 · 첫 달은 안 받기 등).
 *    여기 계산은 '설명하기 제일 쉬운 기본값'일 뿐이고, 다르면 사장님이 그 달 금액을 직접 적는다.
 *    그래서 근거(note)를 문서에 함께 적어 담당자가 무엇을 어떻게 나눈 값인지 알 수 있게 한다.
 */
function chargeForMonth(
  contract: ChargeContract,
  billingMonth: string,
): { amount: number; note?: string } {
  const monthStart = `${billingMonth}-01`
  const monthEnd = monthEndYmd(billingMonth)

  const from = contract.start_date > monthStart ? contract.start_date : monthStart
  const to = contract.end_date && contract.end_date < monthEnd ? contract.end_date : monthEnd
  if (to < from) return { amount: 0 }

  const daysInMonth = dayOf(monthEnd)
  const segments = normalizedSegments(contract)

  // 그 달 안에서 '같은 금액이 유지된 날짜 덩어리'로 자른다
  const pieces: { price: number; fromDay: number; toDay: number }[] = []
  for (let i = 0; i < segments.length; i++) {
    const segFrom = segments[i].from
    const segTo = i + 1 < segments.length ? prevDayYmd(segments[i + 1].from) : '9999-12-31'
    const start = segFrom > from ? segFrom : from
    const end = segTo < to ? segTo : to
    if (start > end) continue
    pieces.push({ price: segments[i].price, fromDay: dayOf(start), toDay: dayOf(end) })
  }
  if (pieces.length === 0) return { amount: 0 }

  const coveredDays = pieces.reduce((sum, p) => sum + (p.toDay - p.fromDay + 1), 0)

  // 한 금액으로 그 달을 다 채웠으면 나눌 것이 없다
  if (pieces.length === 1 && coveredDays >= daysInMonth) return { amount: pieces[0].price }

  // 조각마다 날수 비율로 나눠 더하고, 반올림은 마지막에 한 번만 (조각별로 반올림하면 합이 밀린다)
  const exact = pieces.reduce(
    (sum, p) => sum + (p.price * (p.toDay - p.fromDay + 1)) / daysInMonth,
    0,
  )

  // 근거 한 줄 — 금액이 바뀐 달은 구간을 나열하고, 아니면 며칠치인지만
  const note =
    pieces.length > 1
      ? pieces
          .map((p) => `${p.fromDay}~${p.toDay}일 ${formatAmount(p.price)}원`)
          .join(' · ')
      : contract.start_date > monthStart
        ? `${pieces[0].fromDay}일 시작 · ${daysInMonth}일 중 ${coveredDays}일`
        : `${pieces[0].toDay}일 종료 · ${daysInMonth}일 중 ${coveredDays}일`

  return { amount: Math.round(exact), note }
}

/**
 * 이번 달 청구 내역. 청구할 계약이 없으면 null — 문서에 절 자체를 그리지 않는다.
 * (일회성 작업만 있는 거래처에 빈칸이나 0원이 나가면 안 된다)
 */
export function buildMonthlyCharge(params: {
  contracts: ChargeContract[]
  /** 청구 대상 월 'YYYY-MM' */
  billingMonth: string
  /** 청구번호를 거래처·월 단위로 고정하기 위한 값 */
  customerId: string
  /** 오늘(KST 'YYYY-MM-DD') */
  issuedYmd: string
  /** 사장님이 그 달 금액을 직접 적었으면 그 값(원). null·undefined면 자동 계산값 */
  overrideTotal?: number | null
  /** 그 달 일회성 추가 작업 중 아직 못 받은 건 — 계약분 아래에 한 줄씩 붙는다 */
  oneOffJobs?: OneOffJob[]
}): MonthlyCharge | null {
  const { contracts, billingMonth, customerId, issuedYmd, overrideTotal, oneOffJobs } = params

  const rows: ChargeRow[] = []
  for (const c of contracts) {
    if (!wasActiveInMonth(c, billingMonth)) continue
    const { amount, note } = chargeForMonth(c, billingMonth)
    if (amount <= 0) continue
    const cycle = formatFrequency(c.frequency)
    rows.push({
      label: cycle && cycle !== '—' ? `${c.service_type} · ${cycle}` : c.service_type,
      amount,
      note,
    })
  }

  // 계약이 없는 달엔 일회성 작업만으로 월간 청구를 만들지 않는다 —
  // 그 거래처엔 애초에 월간 보고서가 안 나가고, 작업 완료 보고서가 청구를 맡는다.
  if (rows.length === 0) return null

  for (const job of oneOffJobs ?? []) {
    if (job.amount <= 0) continue
    rows.push({ label: job.label, amount: job.amount, note: job.note })
  }

  const autoTotal = rows.reduce((sum, r) => sum + r.amount, 0)
  // 0원도 사장님의 뜻이다("이 달은 청구 안 함") — 그럴 땐 절을 그리지 않는다
  const adjusted = typeof overrideTotal === 'number' && overrideTotal !== autoTotal
  const total = typeof overrideTotal === 'number' ? overrideTotal : autoTotal
  if (total <= 0) return null

  return {
    rows,
    autoTotal,
    total,
    adjusted,
    // 청구서 탭과 같은 번호 규칙을 쓴다(정기 = 월이 들어간 번호)
    invoiceNo: buildInvoiceNumber({
      quoteNumber: null,
      quoteId: customerId,
      isOneOff: false,
      billingMonth,
    }),
    // 기한도 같은 규칙 — 표준 계약서 제4조 '익월 말일까지'
    dueYmd: invoiceDueYmd({ issuedYmd, isOneOff: false, billingMonth }),
  }
}
