import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { verifyPortOnePayment } from '@/lib/payments/portone'
import { activateSubscription } from '@/lib/payments/activate'

// 포트원(PortOne) V2 결제 검증 API — 데스크톱 팝업 흐름에서 호출.
// POST /api/payment/confirm  body: { paymentId }
// 클라이언트 결제 완료 후 서버에서 포트원 결제 내역을 조회해 위변조를 검증하고 구독을 활성화한다.
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

    const { paymentId } = (await req.json()) as { paymentId?: string }
    if (!paymentId) {
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

    // paymentId에 businessId가 포함되어 있는지 확인 (타인 결제 방지)
    if (!paymentId.startsWith(profile.business_id)) {
      return NextResponse.json({ error: '잘못된 주문 정보입니다' }, { status: 400 })
    }

    // 포트원 서버 조회로 상태·금액 위변조 검증
    const verified = await verifyPortOnePayment(paymentId)
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 400 })
    }

    await activateSubscription(
      db as unknown as SupabaseClient,
      profile.business_id,
      verified.planId,
      { orderId: paymentId, paymentKey: verified.paymentKey }
    )

    return NextResponse.json({ success: true, planId: verified.planId, amount: verified.amount })
  } catch (e) {
    console.error('[Payment] 예기치 못한 오류:', e)
    return NextResponse.json({ error: '결제 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
