import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReviewClaimedAlimtalk } from '@/lib/kakao/alimtalk'
import { sendPushToBusiness } from '@/lib/push/web-push'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

// 고객이 별점+후기를 남길 때 호출 — 후기 저장(사회적 증거) + 별점 분기 처리
export async function POST(request: NextRequest) {
  const body = await request.json() as { claimId?: string; rating?: number; comment?: string }
  if (!body.claimId) {
    return NextResponse.json({ error: 'claimId required' }, { status: 400 })
  }

  // 별점 검증 (1~5). 없으면 예전 방식(단순 인증)으로 처리 — 하위호환
  const rating = typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5
    ? Math.round(body.rating)
    : null
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : null

  const db = createServiceClient()

  // 클레임 + 업체 + 예약 정보 조회
  const { data: claim } = await db
    .from('review_claims')
    .select('id, claimed_at, business_id, booking_id, customer_phone, businesses!business_id(name, phone, review_reward_type, review_reward_description), bookings!booking_id(customer_name)')
    .eq('id', body.claimId)
    .maybeSingle()

  if (!claim) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // 이미 인증한 경우 중복 처리 방지
  if (claim.claimed_at) {
    return NextResponse.json({ ok: true, alreadyClaimed: true })
  }

  const biz = Array.isArray(claim.businesses) ? claim.businesses[0] : claim.businesses
  const booking = Array.isArray(claim.bookings) ? claim.bookings[0] : claim.bookings
  const bizInfo = biz as { name: string; phone: string | null; review_reward_type: string; review_reward_description: string | null } | null
  const customerName = (booking as { customer_name: string | null } | null)?.customer_name ?? '고객'

  const isPublic = rating !== null ? rating >= 4 : true

  // 인증 시각 기록
  await db
    .from('review_claims')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', claim.id)

  // 별점을 남긴 경우 reviews에 저장 (전시용 사회적 증거). claim당 1건(unique) — 중복 무시
  if (rating !== null) {
    try {
      await db.from('reviews' as never).insert({
        business_id: claim.business_id,
        booking_id: (claim as { booking_id: string | null }).booking_id ?? null,
        claim_id: claim.id,
        customer_name: customerName,
        rating,
        comment: comment || null,
        is_public: isPublic,
        routed_to: isPublic ? 'external' : 'private',
      } as never)
    } catch (e) {
      console.error('[Review] 후기 저장 실패:', e)
    }
  }

  // 대표 알림 — 별점에 따라 분기
  try {
    if (rating !== null && rating <= 3) {
      // 낮은 평점 → 즉시 케어 신호(웹푸시). 공개로 새지 않게 대표가 먼저 대응
      await sendPushToBusiness(claim.business_id, {
        title: `😟 별점 ${rating}점 후기가 들어왔어요`,
        body: `${customerName}님이 아쉬운 점을 남겼어요${comment ? `: "${comment.slice(0, 40)}"` : ''} — 지금 연락해 케어하면 관계를 회복할 수 있어요`,
        url: '/dashboard/marketing',
        tag: `low-review-${claim.id}`,
      })
    } else if (bizInfo?.phone) {
      // 좋은 후기 → 기존 인증 알림톡(혜택 안내 리마인더)
      await sendReviewClaimedAlimtalk({
        ownerPhone:        bizInfo.phone,
        customerName,
        businessName:      bizInfo.name,
        rewardDescription: bizInfo.review_reward_type !== 'none' ? bizInfo.review_reward_description : null,
        dashboardUrl:      `${appUrl}/dashboard/marketing`,
      })
    }
  } catch {
    // 알림 실패는 무시
  }

  return NextResponse.json({ ok: true, rating, isPublic })
}
