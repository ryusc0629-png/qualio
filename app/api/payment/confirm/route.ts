import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { verifyPortOnePaymentByOrder } from '@/lib/payments/portone'
import { activateSubscription } from '@/lib/payments/activate'
import type { PlanId } from '@/lib/config/plans'

// 포트원(PortOne) V2 단건 결제 검증 API — 데스크톱 팝업 흐름에서 호출.
// POST /api/payment/confirm  body: { orderId }
// 짧은 주문번호(KCP 40자 제약)로 저장된 주문을 조회해 금액·플랜을 신뢰 기준으로 삼고,
// 포트원 서버 조회로 결제 상태·금액 위변조를 검증한 뒤 구독을 활성화한다.
// (모바일 리다이렉트 흐름은 /api/payment/portone-return 에서 처리)
export async function POST(req: NextRequest) {
  try {
    // 인증 확인
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const { orderId } = (await req.json()) as { orderId?: string }
    if (!orderId) {
      return NextResponse.json({ error: '결제 정보가 올바르지 않습니다' }, { status: 400 })
    }

    const db = createServiceClient()

    // 업체 조회 (사용자 본인 확인)
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) {
      return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다' }, { status: 404 })
    }

    // 주문 조회 (pending) — 금액·플랜의 신뢰 기준
    const { data: order } = (await (db as unknown as SupabaseClient)
      .from('kcp_payment_orders')
      .select('business_id, plan_id, amount, status')
      .eq('ordr_idxx', orderId)
      .maybeSingle()) as unknown as {
      data: { business_id: string; plan_id: string; amount: number; status: string } | null
    }
    if (!order) {
      return NextResponse.json({ error: '주문 정보를 찾을 수 없습니다' }, { status: 404 })
    }
    if (order.business_id !== profile.business_id) {
      return NextResponse.json({ error: '잘못된 주문 정보입니다' }, { status: 400 })
    }
    if (order.status === 'paid') {
      return NextResponse.json({ error: '이미 처리된 결제입니다' }, { status: 409 })
    }

    // 포트원 서버 조회로 상태·금액 위변조 검증
    const verified = await verifyPortOnePaymentByOrder(orderId, order.amount)
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 400 })
    }

    const planId = order.plan_id as PlanId
    await activateSubscription(db as unknown as SupabaseClient, profile.business_id, planId, {
      orderId,
      paymentKey: verified.paymentKey,
    })
    await (db as unknown as SupabaseClient)
      .from('kcp_payment_orders')
      .update({ status: 'paid' })
      .eq('ordr_idxx', orderId)

    return NextResponse.json({ success: true, planId, amount: order.amount })
  } catch (e) {
    console.error('[Payment] 예기치 못한 오류:', e)
    return NextResponse.json({ error: '결제 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
