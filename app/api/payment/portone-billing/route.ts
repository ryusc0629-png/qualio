import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { chargeBillingKey } from '@/lib/payments/portone'
import { activateSubscription } from '@/lib/payments/activate'
import { PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

// 포트원 정기결제 — 빌키 발급 후 첫 결제(데스크톱 팝업 흐름).
// POST /api/payment/portone-billing  body: { orderId, billingKey }
// 발급된 빌키로 서버에서 첫 달을 청구하고, 빌키를 저장해 매월 자동청구에 사용한다.
export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const { orderId, billingKey } = (await req.json()) as {
      orderId?: string
      billingKey?: string
    }
    if (!orderId || !billingKey) {
      return NextResponse.json({ error: '결제 정보가 올바르지 않습니다' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id, businesses!business_id(name, phone)')
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

    const planId = order.plan_id as PlanId
    const biz = profile.businesses as { name: string; phone: string | null } | null

    const charged = await chargeBillingKey({
      paymentId: orderId,
      billingKey,
      planId,
      orderName: `퀄리오 ${PLANS[planId]?.label ?? planId} 플랜 1개월`,
      customer: {
        id: profile.business_id,
        phoneNumber: (biz?.phone ?? '').replace(/[^0-9]/g, '') || undefined,
        email: user.email ?? undefined,
      },
    })
    if (!charged.ok) {
      return NextResponse.json({ error: charged.error }, { status: 400 })
    }

    await activateSubscription(db as unknown as SupabaseClient, profile.business_id, planId, {
      orderId,
      paymentKey: orderId,
      billingKey,
    })
    await (db as unknown as SupabaseClient)
      .from('kcp_payment_orders')
      .update({ status: 'paid' })
      .eq('ordr_idxx', orderId)

    return NextResponse.json({ success: true, planId, amount: charged.amount })
  } catch (e) {
    console.error('[Billing] 예기치 못한 오류:', e)
    return NextResponse.json({ error: '결제 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
