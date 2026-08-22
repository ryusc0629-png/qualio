// 청구서(대금 청구) 계산 — 견적서 한 장에서 청구번호·청구 대상 월·입금 기한을 만든다.
//
// 왜 분리했나: 말일·익월 계산은 눈으로 검증하기 어렵고, 여기서 어긋나면 거래처에
// '이미 지나간 날짜'가 입금 기한으로 찍힌 청구서가 나간다. 순수 함수로 빼서 테스트로 고정한다.
//
// 기한 규칙은 표준 계약서(lib/contract/standard-contract.ts 제4조)와 같은 말을 해야 한다.
//   · 정기: "당월 용역대금을 익월 말일까지" → 청구 대상 월의 다음 달 말일
//   · 일회성: "용역 완료 후" → 청구일이 속한 달의 말일
// 두 경우 모두, 늦게 청구해서 기한이 이미 지난 날짜가 되는 일은 없게 한다.

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseYm(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-')
  return { year: Number(y), month: Number(m) }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function toBillingMonth(ymd: string): string {
  return ymd.slice(0, 7)
}

/** 'YYYY-MM'을 delta개월 옮긴다. 연도 경계를 넘어가도 안전. */
export function shiftMonth(ym: string, delta: number): string {
  const { year, month } = parseYm(ym)
  const total = year * 12 + (month - 1) + delta
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`
}

/** 그 달의 마지막 날 'YYYY-MM-DD' */
export function monthEndYmd(ym: string): string {
  const { year, month } = parseYm(ym)
  const last = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]
  return `${year}-${pad2(month)}-${pad2(last)}`
}

/** 청구 대상 월 라벨 — '2026년 8월분' */
export function billingMonthLabel(ym: string): string {
  const { year, month } = parseYm(ym)
  return `${year}년 ${month}월분`
}

/**
 * 입금 기한 'YYYY-MM-DD'.
 * 정기는 청구 대상 월의 익월 말일, 일회성은 청구일이 속한 달의 말일.
 * 지난 달치를 뒤늦게 청구해도 기한이 과거가 되지 않도록 '청구일이 속한 달의 말일'을 하한으로 둔다.
 */
export function invoiceDueYmd(params: {
  issuedYmd: string
  isOneOff: boolean
  billingMonth: string
}): string {
  const { issuedYmd, isOneOff, billingMonth } = params
  const byRule = monthEndYmd(isOneOff ? toBillingMonth(issuedYmd) : shiftMonth(billingMonth, 1))
  const floor = monthEndYmd(toBillingMonth(issuedYmd))
  // 'YYYY-MM-DD'는 문자열 비교만으로 날짜 순서가 맞다
  return byRule > floor ? byRule : floor
}

/**
 * 청구번호.
 * 정기는 매달 한 장씩 나가므로 청구 대상 월을 번호에 넣어 서로 구분되게 한다.
 *   정기   I-202608-0001   (2026년 8월분, 견적 순번 0001)
 *   일회성 I-2026-0001     (견적번호 Q-2026-0001에서 파생)
 * 견적번호가 없는 옛 견적서는 견적 id 앞자리를 쓴다.
 */
export function buildInvoiceNumber(params: {
  quoteNumber: string | null | undefined
  quoteId: string
  isOneOff: boolean
  billingMonth: string
}): string {
  const { quoteNumber, quoteId, isOneOff, billingMonth } = params
  const trimmed = quoteNumber?.trim()

  if (isOneOff) {
    return trimmed ? trimmed.replace(/^Q-/, 'I-') : `I-${quoteId.slice(0, 8).toUpperCase()}`
  }

  const seq = trimmed?.match(/(\d{4})$/)?.[1] ?? quoteId.slice(0, 4).toUpperCase()
  return `I-${billingMonth.replace('-', '')}-${seq}`
}
