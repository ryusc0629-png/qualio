import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ReviewClaimClient } from './review-claim-client'

interface Props {
  params: Promise<{ token: string }>
}

export default async function ReviewClaimPage({ params }: Props) {
  const { token } = await params
  const db = createServiceClient()

  // 토큰 조회 + 업체/예약 정보
  const { data: claim } = await db
    .from('review_claims')
    .select('id, claimed_at, businesses!business_id(name, google_place_url, naver_place_url, review_reward_type, review_reward_description), bookings!booking_id(customer_name)')
    .eq('token', token)
    .maybeSingle()

  if (!claim) notFound()

  const biz     = Array.isArray(claim.businesses) ? claim.businesses[0] : claim.businesses
  const booking = Array.isArray(claim.bookings)   ? claim.bookings[0]   : claim.bookings

  const bizInfo = biz as {
    name: string
    google_place_url: string | null
    naver_place_url: string | null
    review_reward_type: string
    review_reward_description: string | null
  } | null

  if (!bizInfo) notFound()

  const reviewUrl = bizInfo.google_place_url ?? bizInfo.naver_place_url ?? null
  const customerName = (booking as { customer_name: string | null } | null)?.customer_name ?? '고객'
  const alreadyClaimed = !!claim.claimed_at

  // 페이지 방문 기록 (fire-and-forget)
  void db.from('review_claims').update({ clicked_at: new Date().toISOString() }).eq('id', claim.id).is('clicked_at', null)

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8 space-y-6 text-center">

        {/* 업체명 */}
        <div>
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">⭐</span>
          </div>
          <h1 className="text-lg font-bold">{bizInfo.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {customerName}님, 이용해 주셔서 감사합니다!
          </p>
        </div>

        {/* 보상 안내 */}
        {bizInfo.review_reward_type !== 'none' && bizInfo.review_reward_description && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-1">
            <p className="text-xs font-semibold text-amber-700">후기 작성 혜택</p>
            <p className="text-sm font-medium text-amber-900">{bizInfo.review_reward_description}</p>
            <p className="text-xs text-amber-600">후기 작성 후 업체에서 개별 안내 드려요</p>
          </div>
        )}

        {/* 인증 또는 완료 상태 */}
        {alreadyClaimed ? (
          <div className="space-y-3">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <span className="text-xl">✓</span>
            </div>
            <p className="text-sm font-medium text-emerald-700">후기 인증 완료!</p>
            <p className="text-xs text-muted-foreground">이미 인증하셨습니다. 감사합니다 😊</p>
          </div>
        ) : (
          <ReviewClaimClient
            claimId={claim.id}
            reviewUrl={reviewUrl}
            hasReward={bizInfo.review_reward_type !== 'none' && !!bizInfo.review_reward_description}
          />
        )}

      </div>
    </div>
  )
}
