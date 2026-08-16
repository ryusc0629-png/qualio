import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyPortOnePaymentByOrder } from '@/lib/payments/portone'
import { verifyWebhookSignature } from '@/lib/payments/webhook-signature'
import { claimPendingOrder, releaseClaimedOrder } from '@/lib/payments/order-claim'
import { activateSubscription } from '@/lib/payments/activate'
import type { PlanId } from '@/lib/config/plans'

// 포트원(PortOne) 결제 웹훅 — 결제 결과를 포트원 서버가 직접 알려주는 경로.
//
// 왜 필요한가: 지금까지 구독 활성화는 결제창에서 돌아온 브라우저가 우리 서버를 호출해야만 이뤄졌다.
// 그 호출 한 번이 끊기면(창을 바로 닫음·네트워크 끊김·앱 전환) "카드는 승인됐는데 구독은 안 켜진"
// 상태가 되고, 사장님이 CS로 알아채기 전까지 아무도 모른다.
// 웹훅은 브라우저와 무관하게 포트원이 우리에게 직접 알려주므로 그 유실을 메운다.
//
// 포트원 콘솔 > 결제연동 > 웹훅에 이 주소를 등록하고, 발급된 시크릿을 PORTONE_WEBHOOK_SECRET에 넣을 것.
//   https://qualio.co.kr/api/payment/portone-webhook
export async function POST(req: NextRequest) {
  // 서명 검증에는 가공되지 않은 원본 본문이 필요하다(JSON 파싱 후엔 재현 불가)
  const rawBody = await req.text()

  const secret = process.env.PORTONE_WEBHOOK_SECRET
  if (!secret) {
    // 시크릿이 없으면 진짜 포트원 요청인지 확인할 방법이 없다 → 처리하지 않는다.
    // (등록 전에는 기존 결제창 복귀 경로가 그대로 동작하므로 결제 자체엔 영향 없음)
    console.error('[Payment webhook] PORTONE_WEBHOOK_SECRET 미설정 — 웹훅 무시')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  const header = (name: string) => req.headers.get(name) ?? req.headers.get(`x-portone-${name.replace('webhook-', '')}`)
  const verified = verifyWebhookSignature({
    secret,
    body: rawBody,
    id: header('webhook-id'),
    timestamp: header('webhook-timestamp'),
    signature: header('webhook-signature'),
  })
  if (!verified.ok) {
    console.error('[Payment webhook] 서명 검증 실패:', verified.reason)
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: { type?: string; data?: { paymentId?: string } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    console.error('[Payment webhook] 본문 파싱 실패')
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const type = event.type ?? ''
  const paymentId = event.data?.paymentId

  // 결제 완료만 처리한다. 나머지(가상계좌 발급·취소·실패 등)는 받되 아무 것도 하지 않는다.
  // 환불·취소는 포트원 콘솔에서 수동 처리하는 것이 현재 운영 방식이라 자동으로 구독을 끊지 않는다.
  if (type !== 'Transaction.Paid') {
    console.error('[Payment webhook] 처리 대상 아님:', type, paymentId ?? '')
    return NextResponse.json({ received: true })
  }
  if (!paymentId) {
    console.error('[Payment webhook] paymentId 없음:', type)
    return NextResponse.json({ received: true })
  }

  try {
    const db = createServiceClient() as unknown as SupabaseClient

    // 이 결제로 만든 주문이 있는지 먼저 확인 (없으면 우리 주문이 아님)
    const { data: order } = (await db
      .from('kcp_payment_orders')
      .select('amount, status')
      .eq('ordr_idxx', paymentId)
      .maybeSingle()) as unknown as { data: { amount: number; status: string } | null }

    if (!order) {
      console.error('[Payment webhook] 주문 없음:', paymentId)
      return NextResponse.json({ received: true })
    }
    // 결제창 복귀 경로가 이미 처리함 — 정상이며 아무 것도 하지 않는다(멱등)
    if (order.status === 'paid') return NextResponse.json({ received: true })

    // 포트원 서버에 다시 물어 상태·금액을 확인한다(웹훅 본문의 값을 믿지 않는다)
    const paid = await verifyPortOnePaymentByOrder(paymentId, order.amount)
    if (!paid.ok) {
      console.error('[Payment webhook] 결제 검증 실패:', paymentId, paid.error)
      // 일시적 조회 실패일 수 있으므로 실패로 응답해 포트원이 재시도하게 둔다
      return NextResponse.json({ error: 'verification failed' }, { status: 500 })
    }

    // 선점 성공한 요청만 활성화한다(결제창 복귀와 동시에 도착해도 한 번만 처리)
    const claimed = await claimPendingOrder(db, paymentId)
    if (!claimed) return NextResponse.json({ received: true })

    try {
      await activateSubscription(db, claimed.business_id, claimed.plan_id as PlanId, {
        orderId: paymentId,
        paymentKey: paid.paymentKey,
      })
    } catch (e) {
      await releaseClaimedOrder(db, paymentId)
      throw e
    }

    console.error('[Payment webhook] 구독 활성화 완료(웹훅 경로):', paymentId, claimed.plan_id)
    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('[Payment webhook] 처리 중 오류:', paymentId, e)
    // 500을 주면 포트원이 재시도한다
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
