import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { confirmTossPayment } from '@/lib/payments/toss'
import { activateSubscription } from '@/lib/payments/activate'

// 토스페이먼츠 결제창 성공 복귀 지점.
// 토스는 결제 성공 시 successUrl로 리다이렉트하며 쿼리에 paymentKey·orderId·amount를 붙인다.
// 서버가 승인 API를 호출해야 결제가 최종 완료된다.
// GET /api/payment/toss-return?paymentKey=...&orderId=...&amount=...
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const base = url.origin
  const paymentKey = url.searchParams.get('paymentKey')
  const orderId = url.searchParams.get('orderId')
  const amountStr = url.searchParams.get('amount')

  const fail = (msg: string) =>
    NextResponse.redirect(
      `${base}/upgrade/success?status=fail&message=${encodeURIComponent(msg)}`
    )

  if (!paymentKey || !orderId || !amountStr) {
    return fail(url.searchParams.get('message') ?? '결제가 취소되었어요')
  }

  try {
    const confirmed = await confirmTossPayment({
      paymentKey,
      orderId,
      amount: Number(amountStr),
    })
    if (!confirmed.ok) return fail(confirmed.error)

    const db = createServiceClient()
    await activateSubscription(
      db as unknown as SupabaseClient,
      confirmed.businessId,
      confirmed.planId,
      { orderId, paymentKey }
    )

    return NextResponse.redirect(
      `${base}/upgrade/success?status=paid&ordr=${encodeURIComponent(orderId)}&amount=${confirmed.amount}&plan=${confirmed.planId}`
    )
  } catch (e) {
    console.error('[Payment] 토스 리다이렉트 처리 오류:', e)
    return fail('결제 처리 중 오류가 발생했어요')
  }
}
