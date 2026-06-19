// 결제 퍼널 이벤트 기록 — 할부 노출→선택→결제 전환율의 원천 데이터.
//
// ▶ 활성화(연결) 지점:
//   고객용 예약 결제 플로우(토스 라이브 후)에서 아래 시점에 한 줄씩 호출하면 끝이다.
//   - 결제창 노출 시:        trackPaymentFunnelEvent({ eventType: 'checkout_shown', ... })
//   - 할부 옵션 노출 시:     trackPaymentFunnelEvent({ eventType: 'installment_shown', ... })
//   - 할부 선택 시:          trackPaymentFunnelEvent({ eventType: 'installment_selected', installmentMonths })
//   - 결제 완료 시:          trackPaymentFunnelEvent({ eventType: 'paid', amount, installmentMonths })
//   그러면 /admin '결제 퍼널' 지표(할부 전환율·결제 GMV)가 자동으로 채워진다.
//
// 서버 전용. 기록 실패는 결제 흐름을 막지 않도록 조용히 삼킨다(로그만).

import { createInternalClient } from '@/lib/supabase/internal'

export type PaymentFunnelEventType =
  | 'checkout_shown'
  | 'installment_shown'
  | 'installment_selected'
  | 'paid'

export interface PaymentFunnelEvent {
  eventType: PaymentFunnelEventType
  businessId?: string | null
  bookingId?: string | null
  amount?: number | null
  installmentMonths?: number | null
  meta?: Record<string, unknown>
}

export async function trackPaymentFunnelEvent(event: PaymentFunnelEvent): Promise<void> {
  try {
    await createInternalClient()
      .from('payment_funnel_events')
      .insert({
        business_id: event.businessId ?? null,
        booking_id: event.bookingId ?? null,
        event_type: event.eventType,
        amount: event.amount ?? null,
        installment_months: event.installmentMonths ?? null,
        meta: event.meta ?? {},
      })
  } catch (error) {
    // 트래킹 실패가 결제를 막아선 안 된다.
    console.error('[Payment] 퍼널 이벤트 기록 실패:', error)
  }
}
