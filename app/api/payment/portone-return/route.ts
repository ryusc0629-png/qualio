import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyPortOnePaymentByOrder } from '@/lib/payments/portone'
import { activateSubscription } from '@/lib/payments/activate'
import type { PlanId } from '@/lib/config/plans'

// 포트원 단건 결제 모바일 리다이렉트 복귀 지점.
// 모바일 환경에서는 결제창이 팝업이 아니라 페이지 이동(리다이렉트) 방식이라,
// 포트원이 결제 후 이 URL로 돌아오며 쿼리에 code·message를 붙인다.
// orderId는 우리가 redirectUrl에 심어 보낸 짧은 주문번호다.
// GET /api/payment/portone-return?orderId=...&code=...&message=...
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const base = url.origin
  const orderId = url.searchParams.get('orderId')
  const code = url.searchParams.get('code')
  const message = url.searchParams.get('message')

  const fail = (msg: string) =>
    NextResponse.redirect(
      `${base}/upgrade/success?status=fail&message=${encodeURIComponent(msg)}`
    )

  // code가 있으면 사용자가 취소했거나 PG 오류
  if (code || !orderId) {
    return fail(message ?? '결제가 취소되었어요')
  }

  try {
    const db = createServiceClient()
    const { data: order } = (await (db as unknown as SupabaseClient)
      .from('kcp_payment_orders')
      .select('business_id, plan_id, amount, status')
      .eq('ordr_idxx', orderId)
      .maybeSingle()) as unknown as {
      data: { business_id: string; plan_id: string; amount: number; status: string } | null
    }

    if (!order) return fail('주문 정보를 찾을 수 없어요')
    // 이미 처리됐으면 성공 페이지로 (중복 처리 방지)
    if (order.status === 'paid') {
      return NextResponse.redirect(
        `${base}/upgrade/success?status=paid&ordr=${encodeURIComponent(orderId)}&amount=${order.amount}&plan=${order.plan_id}`
      )
    }

    const verified = await verifyPortOnePaymentByOrder(orderId, order.amount)
    if (!verified.ok) return fail(verified.error)

    const planId = order.plan_id as PlanId
    await activateSubscription(db as unknown as SupabaseClient, order.business_id, planId, {
      orderId,
      paymentKey: verified.paymentKey,
    })
    await (db as unknown as SupabaseClient)
      .from('kcp_payment_orders')
      .update({ status: 'paid' })
      .eq('ordr_idxx', orderId)

    return NextResponse.redirect(
      `${base}/upgrade/success?status=paid&ordr=${encodeURIComponent(orderId)}&amount=${order.amount}&plan=${planId}`
    )
  } catch (e) {
    console.error('[Payment] 포트원 리다이렉트 처리 오류:', e)
    return fail('결제 처리 중 오류가 발생했어요')
  }
}
