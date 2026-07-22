import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyPortOnePayment } from '@/lib/payments/portone'
import { activateSubscription } from '@/lib/payments/activate'

// 포트원 모바일 리다이렉트 복귀 지점.
// 모바일 환경에서는 결제창이 팝업이 아니라 페이지 이동(리다이렉트) 방식이라,
// 포트원이 결제 후 이 URL로 돌아오며 쿼리에 paymentId·code·message를 붙인다.
// GET /api/payment/portone-return?paymentId=...&code=...&message=...
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const base = url.origin
  const paymentId = url.searchParams.get('paymentId')
  const code = url.searchParams.get('code')
  const message = url.searchParams.get('message')

  const fail = (msg: string) =>
    NextResponse.redirect(
      `${base}/upgrade/success?status=fail&message=${encodeURIComponent(msg)}`
    )

  // code가 있으면 사용자가 취소했거나 PG 오류
  if (code || !paymentId) {
    return fail(message ?? '결제가 취소되었어요')
  }

  try {
    const verified = await verifyPortOnePayment(paymentId)
    if (!verified.ok) return fail(verified.error)

    const db = createServiceClient()
    await activateSubscription(
      db as unknown as SupabaseClient,
      verified.businessId,
      verified.planId,
      { orderId: paymentId, paymentKey: verified.paymentKey }
    )

    return NextResponse.redirect(
      `${base}/upgrade/success?status=paid&ordr=${encodeURIComponent(paymentId)}&amount=${verified.amount}&plan=${verified.planId}`
    )
  } catch (e) {
    console.error('[Payment] 포트원 리다이렉트 처리 오류:', e)
    return fail('결제 처리 중 오류가 발생했어요')
  }
}
