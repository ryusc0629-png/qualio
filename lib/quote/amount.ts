// 견적서 금액 계산 — 화면과 저장·매출 반영이 같은 계산을 쓰도록 한곳에 모은다.
//
// 왜 분리했나: 이 계산이 틀리면 매출이 조용히 부풀거나 깎인다(부가세 포함 금액을 그대로 매출로 넣거나,
// 정기계약에 방문 횟수를 곱하는 식). 눈으로 매번 확인하지 않도록 함수로 빼서 자동 테스트로 고정한다.

export interface QuoteItemLike {
  qty: number
  unit_price: number
}

export interface QuoteAmountLike {
  items: QuoteItemLike[]
  total_amount: number
  tax_included: boolean
  /** 'one_off' = 일회성(수량을 곱함) / 그 외 = 정기(월정액이라 횟수를 곱하지 않음) */
  job_type?: string | null
  discount_type?: string | null
  discount_value?: number | null
}

/**
 * 견적서의 '부가세 미포함(공급가액)' 금액.
 *
 * - 정기계약은 월정액이라 방문 횟수(qty)를 곱하지 않는다. 곱하면 금액이 몇 배로 뛴다.
 * - 할인은 소계를 넘지 못한다(마이너스 금액 방지).
 * - 항목이 하나도 없는 예외 상황에서만 총액에서 역산한다(부가세 포함이면 1.1로 나눔).
 */
export function quoteSupplyAmount(quote: QuoteAmountLike): number {
  const isOneOff = quote.job_type === 'one_off'
  const subtotal = quote.items.reduce(
    (sum, it) => sum + (isOneOff ? it.qty * it.unit_price : it.unit_price),
    0,
  )

  if (subtotal <= 0) {
    return quote.tax_included ? Math.round(quote.total_amount / 1.1) : quote.total_amount
  }

  const discountValue = quote.discount_value ?? 0
  const discount =
    quote.discount_type === 'rate'
      ? Math.min(subtotal, Math.floor(subtotal * (discountValue / 100)))
      : quote.discount_type === 'amount'
        ? Math.min(subtotal, discountValue)
        : 0

  return subtotal - discount
}
