import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// 구독 취소 API
// POST /api/payment/cancel
// 취소 시 status='cancelled'로 변경, current_period_end까지 서비스 유지
export async function POST(_req: NextRequest) {
  try {
    // 인증 확인
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const db = createServiceClient()

    // 업체 조회
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.business_id) {
      return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다' }, { status: 404 })
    }

    // 현재 구독 조회
    const { data: subscription } = await db
      .from('subscriptions')
      .select('id, plan, status')
      .eq('business_id', profile.business_id)
      .maybeSingle()

    if (!subscription) {
      return NextResponse.json({ error: '구독 정보를 찾을 수 없습니다' }, { status: 404 })
    }

    if (subscription.plan === 'beta') {
      return NextResponse.json({ error: '베타 플랜은 취소할 수 없습니다' }, { status: 400 })
    }

    if (subscription.status === 'cancelled') {
      return NextResponse.json({ error: '이미 취소된 구독입니다' }, { status: 400 })
    }

    // 구독 취소 — status만 cancelled로 변경 (plan, current_period_end 유지)
    // 환불은 포트원(PortOne) 콘솔에서 수동 처리
    const { error: updateError } = await db
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', subscription.id)

    if (updateError) {
      console.error('[Cancel] DB 업데이트 실패:', updateError)
      return NextResponse.json({ error: '구독 취소에 실패했습니다' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[Cancel] 예기치 못한 오류:', e)
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
