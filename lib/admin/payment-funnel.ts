// 결제 퍼널 집계 — /admin '결제 퍼널' 섹션용.
// payment_funnel_events(lib/payments/track.ts가 적재)를 읽어 전환율·결제 GMV를 계산한다.
// 토스 라이브 전에는 이벤트가 없어 전부 0/null로 안전하게 표시된다.

import { createInternalClient } from '@/lib/supabase/internal'

export interface PaymentFunnel {
  checkoutShown: number
  installmentShown: number
  installmentSelected: number
  paidCount: number
  /** 할부 노출 대비 선택률 (null = 노출 데이터 없음) */
  installmentConversionRate: number | null
  /** 결제 완료 거래액 합(원) — 향후 GMV take-rate의 기반 */
  paymentGmv: number
  hasData: boolean
}

export async function getPaymentFunnel(): Promise<PaymentFunnel> {
  const { data } = await createInternalClient()
    .from('payment_funnel_events')
    .select('event_type, amount')

  const rows = (data ?? []) as { event_type: string; amount: number | null }[]

  const count = (type: string) => rows.filter((r) => r.event_type === type).length
  const checkoutShown = count('checkout_shown')
  const installmentShown = count('installment_shown')
  const installmentSelected = count('installment_selected')
  const paidRows = rows.filter((r) => r.event_type === 'paid')
  const paymentGmv = paidRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

  return {
    checkoutShown,
    installmentShown,
    installmentSelected,
    paidCount: paidRows.length,
    installmentConversionRate:
      installmentShown > 0 ? installmentSelected / installmentShown : null,
    paymentGmv,
    hasData: rows.length > 0,
  }
}
