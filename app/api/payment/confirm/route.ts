import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getPlanPrice } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

// 포트원(PortOne) V2 결제 검증 API
// POST /api/payment/confirm
// body: { paymentId }
// 클라이언트 결제 완료 후 서버에서 포트원 결제 내역을 조회해 위변조를 검증하고 구독을 활성화한다.
export async function POST(req: NextRequest) {
  try {
    // 인증 확인
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const { paymentId } = await req.json() as { paymentId: string }

    if (!paymentId) {
      return NextResponse.json({ error: '결제 정보가 올바르지 않습니다' }, { status: 400 })
    }

    const db = createServiceClient()

    // paymentId 형식: {businessId}_{planId}_{timestamp}
    const parts = paymentId.split('_')
    if (parts.length < 3) {
      return NextResponse.json({ error: '주문 ID 형식이 올바르지 않습니다' }, { status: 400 })
    }

    const planId = parts[1] as PlanId
    const expectedAmount = getPlanPrice(planId)

    // 업체 조회 (사용자 본인 확인)
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.business_id) {
      return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다' }, { status: 404 })
    }

    const businessId = profile.business_id

    // paymentId에 businessId가 포함되어 있는지 확인 (타인 결제 방지)
    if (!paymentId.startsWith(businessId)) {
      return NextResponse.json({ error: '잘못된 주문 정보입니다' }, { status: 400 })
    }

    // 이미 처리된 결제 중복 방지
    // (toss_order_id 컬럼을 포트원 paymentId 저장용으로 재사용 — 레거시 컬럼명)
    const { data: existingPaid } = await db
      .from('subscriptions')
      .select('id')
      .eq('business_id', businessId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('toss_order_id' as any, paymentId)
      .maybeSingle()

    if (existingPaid) {
      return NextResponse.json({ error: '이미 처리된 결제입니다' }, { status: 409 })
    }

    // 포트원 서버에서 실제 결제 내역 조회 (위변조 검증)
    const apiSecret = process.env.PORTONE_V2_API_SECRET
    if (!apiSecret) {
      console.error('[Payment] PORTONE_V2_API_SECRET 환경변수 없음')
      return NextResponse.json({ error: '결제 설정 오류입니다' }, { status: 500 })
    }

    const portoneResponse = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `PortOne ${apiSecret}` } }
    )

    if (!portoneResponse.ok) {
      const portoneError = await portoneResponse.json().catch(() => ({})) as { message?: string }
      console.error('[Payment] 포트원 결제 조회 실패:', portoneError)
      return NextResponse.json(
        { error: portoneError.message ?? '결제 확인에 실패했습니다' },
        { status: 400 }
      )
    }

    const payment = await portoneResponse.json() as {
      status?: string
      amount?: { total?: number }
    }

    // 결제 완료 상태인지 확인
    if (payment.status !== 'PAID') {
      console.error('[Payment] 결제 미완료 상태:', payment.status)
      return NextResponse.json({ error: '결제가 완료되지 않았습니다' }, { status: 400 })
    }

    // 금액 위변조 검증 (포트원에 실제 결제된 금액과 플랜 금액 비교)
    if (payment.amount?.total !== expectedAmount) {
      console.error('[Payment] 결제 금액 불일치:', { paid: payment.amount?.total, expected: expectedAmount })
      return NextResponse.json({ error: '결제 금액이 올바르지 않습니다' }, { status: 400 })
    }

    // 결제 성공 — subscriptions 업데이트
    const now = new Date()
    const nextMonth = new Date(now)
    nextMonth.setMonth(nextMonth.getMonth() + 1)

    // 기존 구독이 있으면 업데이트, 없으면 생성
    const { data: existing } = await db
      .from('subscriptions')
      .select('id, next_plan' as never)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as { data: { id: string; next_plan: string | null } | null }

    // next_plan이 예약되어 있으면 해당 플랜으로 적용, 아니면 결제한 플랜 사용
    const effectivePlan = existing?.next_plan ?? planId

    // toss_order_id / toss_payment_key 컬럼을 포트원 paymentId 저장용으로 재사용(레거시 컬럼명)
    const paymentFields = {
      plan: effectivePlan,
      status: 'active',
      payment_id: paymentId,
      toss_order_id: paymentId,
      toss_payment_key: paymentId,
      current_period_start: now.toISOString(),
      current_period_end: nextMonth.toISOString(),
      next_plan: null, // 예약 초기화
    }

    if (existing) {
      await db
        .from('subscriptions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(paymentFields as any)
        .eq('id', existing.id)
    } else {
      await db.from('subscriptions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ business_id: businessId, ...paymentFields } as any)
    }

    return NextResponse.json({ success: true, planId, amount: expectedAmount })
  } catch (e) {
    console.error('[Payment] 예기치 못한 오류:', e)
    return NextResponse.json({ error: '결제 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
