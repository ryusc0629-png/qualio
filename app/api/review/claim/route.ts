import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReviewClaimedAlimtalk } from '@/lib/kakao/alimtalk'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

// 고객이 "후기 남겼어요" 버튼 클릭 시 호출
export async function POST(request: NextRequest) {
  const body = await request.json() as { claimId?: string }
  if (!body.claimId) {
    return NextResponse.json({ error: 'claimId required' }, { status: 400 })
  }

  const db = createServiceClient()

  // 클레임 + 업체 + 예약 정보 조회
  const { data: claim } = await db
    .from('review_claims')
    .select('id, claimed_at, business_id, customer_phone, businesses!business_id(name, phone, review_reward_type, review_reward_description), bookings!booking_id(customer_name)')
    .eq('id', body.claimId)
    .maybeSingle()

  if (!claim) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // 이미 인증한 경우 중복 처리 방지
  if (claim.claimed_at) {
    return NextResponse.json({ ok: true, alreadyClaimed: true })
  }

  // 인증 시각 기록
  await db
    .from('review_claims')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', claim.id)

  // 사장님에게 알림톡 발송 (실패해도 무시)
  try {
    const biz = Array.isArray(claim.businesses) ? claim.businesses[0] : claim.businesses
    const booking = Array.isArray(claim.bookings) ? claim.bookings[0] : claim.bookings
    const bizInfo = biz as { name: string; phone: string | null; review_reward_type: string; review_reward_description: string | null } | null
    const bookingInfo = booking as { customer_name: string | null } | null

    if (bizInfo?.phone) {
      await sendReviewClaimedAlimtalk({
        ownerPhone:        bizInfo.phone,
        customerName:      bookingInfo?.customer_name ?? '고객',
        businessName:      bizInfo.name,
        rewardDescription: bizInfo.review_reward_type !== 'none' ? bizInfo.review_reward_description : null,
        dashboardUrl:      `${appUrl}/dashboard/marketing`,
      })
    }
  } catch {
    // 알림톡 실패는 무시
  }

  return NextResponse.json({ ok: true })
}
