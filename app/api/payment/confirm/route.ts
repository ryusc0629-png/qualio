import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getPlanPrice } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

// 토스페이먼츠 결제 승인 API
// POST /api/payment/confirm
// body: { paymentKey, orderId, amount }
export async function POST(req: NextRequest) {
  try {
    // 인증 확인
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const { paymentKey, orderId, amount } = await req.json() as {
      paymentKey: string
      orderId: string
      amount: number
    }

    if (!paymentKey || !orderId || !amount) {
      return NextResponse.json({ error: '결제 정보가 올바르지 않습니다' }, { status: 400 })
    }

    const db = createServiceClient()

    // orderId 형식: {businessId}_{planId}_{timestamp}
    const parts = orderId.split('_')
    if (parts.length < 3) {
      return NextResponse.json({ error: '주문 ID 형식이 올바르지 않습니다' }, { status: 400 })
    }

    const planId = parts[1] as PlanId
    const expectedAmount = getPlanPrice(planId)

    // 금액 위변조 검증 (클라이언트에서 넘어온 amount와 실제 플랜 금액 비교)
    if (amount !== expectedAmount) {
      return NextResponse.json({ error: '결제 금액이 올바르지 않습니다' }, { status: 400 })
    }

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

    // orderId에 businessId가 포함되어 있는지 확인 (타인 결제 방지)
    if (!orderId.startsWith(businessId)) {
      return NextResponse.json({ error: '잘못된 주문 정보입니다' }, { status: 400 })
    }

    // 이미 처리된 orderId 중복 결제 방지
    // (마이그레이션 적용 후 toss_order_id 컬럼이 생기면 타입이 자동으로 갱신됨)
    const { data: existingSubscription } = await db
      .from('subscriptions')
      .select('id')
      .eq('business_id', businessId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('toss_order_id' as any, orderId)
      .maybeSingle()

    if (existingSubscription) {
      return NextResponse.json({ error: '이미 처리된 결제입니다' }, { status: 409 })
    }

    // 토스페이먼츠 서버 결제 승인 요청
    const secretKey = process.env.TOSSPAYMENTS_SECRET_KEY
    if (!secretKey) {
      console.error('[Payment] TOSSPAYMENTS_SECRET_KEY 환경변수 없음')
      return NextResponse.json({ error: '결제 설정 오류입니다' }, { status: 500 })
    }

    const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })

    if (!tossResponse.ok) {
      const tossError = await tossResponse.json() as { message?: string }
      console.error('[Payment] 토스 결제 승인 실패:', tossError)
      return NextResponse.json(
        { error: tossError.message ?? '결제 승인에 실패했습니다' },
        { status: 400 }
      )
    }

    // 결제 성공 — subscriptions 업데이트
    const now = new Date()
    const nextMonth = new Date(now)
    nextMonth.setMonth(nextMonth.getMonth() + 1)

    // 기존 구독이 있으면 업데이트, 없으면 생성
    const { data: existing } = await db
      .from('subscriptions')
      .select('id')
      .eq('business_id', businessId)
      .maybeSingle()

    // 새 컬럼(toss_order_id, toss_payment_key)은 마이그레이션 후 Supabase 타입이 자동 갱신됨
    // 그 전까지는 타입 단언으로 처리
    const paymentFields = {
      plan: planId,
      status: 'active',
      payment_id: paymentKey,
      toss_order_id: orderId,
      toss_payment_key: paymentKey,
      current_period_start: now.toISOString(),
      current_period_end: nextMonth.toISOString(),
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

    console.log('[Payment] 결제 승인 완료:', { businessId, planId, paymentKey })
    return NextResponse.json({ success: true, planId })
  } catch (e) {
    console.error('[Payment] 예기치 못한 오류:', e)
    return NextResponse.json({ error: '결제 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
