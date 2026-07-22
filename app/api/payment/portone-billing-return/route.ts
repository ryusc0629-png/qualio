import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { chargeBillingKey } from '@/lib/payments/portone'
import { activateSubscription } from '@/lib/payments/activate'
import { PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

// 포트원 정기결제 — 빌키 발급 모바일 리다이렉트 복귀 지점.
// 모바일은 발급창이 페이지 이동 방식이라, 포트원이 발급 후 이 URL로 돌아오며
// 쿼리에 billingKey·code·message를 붙인다. orderId는 우리가 redirectUrl에 심어 보낸다.
// GET /api/payment/portone-billing-return?orderId=...&billingKey=...&code=...
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const base = url.origin
  const orderId = url.searchParams.get('orderId')
  const billingKey = url.searchParams.get('billingKey')
  const code = url.searchParams.get('code')
  const message = url.searchParams.get('message')

  const fail = (msg: string) =>
    NextResponse.redirect(`${base}/upgrade/success?status=fail&message=${encodeURIComponent(msg)}`)

  if (code || !orderId || !billingKey) {
    return fail(message ?? '카드 등록이 취소되었어요')
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
    // 이미 처리됐으면 성공 페이지로 (중복 청구 방지)
    if (order.status === 'paid') {
      return NextResponse.redirect(
        `${base}/upgrade/success?status=paid&ordr=${encodeURIComponent(orderId)}&amount=${order.amount}&plan=${order.plan_id}`
      )
    }

    const planId = order.plan_id as PlanId
    const charged = await chargeBillingKey({
      paymentId: orderId,
      billingKey,
      planId,
      orderName: `퀄리오 ${PLANS[planId]?.label ?? planId} 플랜 1개월`,
    })
    if (!charged.ok) return fail(charged.error)

    await activateSubscription(db as unknown as SupabaseClient, order.business_id, planId, {
      orderId,
      paymentKey: orderId,
      billingKey,
    })
    await (db as unknown as SupabaseClient)
      .from('kcp_payment_orders')
      .update({ status: 'paid' })
      .eq('ordr_idxx', orderId)

    return NextResponse.redirect(
      `${base}/upgrade/success?status=paid&ordr=${encodeURIComponent(orderId)}&amount=${charged.amount}&plan=${planId}`
    )
  } catch (e) {
    console.error('[Billing] 리다이렉트 처리 오류:', e)
    return fail('결제 처리 중 오류가 발생했어요')
  }
}
