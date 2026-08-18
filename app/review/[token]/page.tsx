import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { resolveReviewPlatform, countGoogleClaims } from '@/lib/review/resolve-platform'
import { toSearchArea } from '@/lib/geo/questions'

// 후기 채널 표시명 — 손님에게 보이는 이름
const PLATFORM_LABELS: Record<string, string> = {
  naver: '네이버',
  google: '구글',
  danggeun: '당근',
  kakao: '카카오맵',
}
import { ReviewClaimClient } from './review-claim-client'
import { ReviewPhotos } from './review-photos'

interface Props {
  params: Promise<{ token: string }>
}

export default async function ReviewClaimPage({ params }: Props) {
  const { token } = await params
  const db = createServiceClient()

  // 토큰 조회 + 업체/예약 정보
  const { data: claim } = await db
    .from('review_claims' as never)
    .select('id, claimed_at, booking_id, business_id, businesses!business_id(name, address, google_place_url, naver_place_url, danggeun_review_url, kakao_place_url, active_review_platform, review_google_first, review_reward_type, review_reward_description), bookings!booking_id(customer_name, service_label, service_address)' as never)
    .eq('token' as never, token)
    .maybeSingle() as unknown as {
      data: { id: string; claimed_at: string | null; booking_id: string | null; business_id: string; businesses: unknown; bookings: unknown } | null
    }

  if (!claim) notFound()

  const biz     = Array.isArray(claim.businesses) ? claim.businesses[0] : claim.businesses
  const booking = Array.isArray(claim.bookings)   ? claim.bookings[0]   : claim.bookings

  const bizInfo = biz as {
    name: string
    address: string | null
    google_place_url: string | null
    naver_place_url: string | null
    danggeun_review_url: string | null
    kakao_place_url: string | null
    active_review_platform: string
    review_google_first: boolean | null
    review_reward_type: string
    review_reward_description: string | null
  } | null

  if (!bizInfo) notFound()

  // 후기 채널 결정 — 구글 리뷰 5개를 채울 때까지는 구글로 보낸다(AI 검색 후보 진입 조건).
  // 판단은 resolveReviewPlatform 한 곳에서만 한다 — 화면과 저장(API)이 갈라지면
  // 손님에겐 구글을 보여주고 기록은 네이버로 남는다.
  const googleClaimed = await countGoogleClaims(db, claim.business_id)
  const resolved = resolveReviewPlatform(bizInfo, googleClaimed)
  const reviewUrl = resolved.url

  // 후기에 넣어달라고 보여줄 예시 한 줄 — "지역 + 받은 서비스".
  // 검색어가 담긴 후기가 지도·AI 노출에 훨씬 크게 작용한다(리뷰 2개로 지도 2위에 오른 사례가 있다).
  // 업체 주소는 사장님 사무실이라 손님 현장과 다를 수 있어, 현장 주소가 있으면 그쪽을 쓴다.
  const serviceLabel = (booking as { service_label?: string | null } | null)?.service_label?.trim()
  const hintArea = toSearchArea(
    (booking as { service_address?: string | null } | null)?.service_address ?? bizInfo.address,
  )
  const keywordHint = hintArea ? `${hintArea} ${serviceLabel || '청소'}` : null
  const customerName = (booking as { customer_name: string | null } | null)?.customer_name ?? '고객'
  const alreadyClaimed = !!claim.claimed_at

  // 그 현장의 작업 전·후 사진 — "아 맞다, 이렇게 깨끗해졌었지"를 떠올리게 한다.
  // 기억을 먼저 살려야 후기가 구체적으로 나온다.
  //
  // ⚠️ 예전엔 전·후 한 장씩만 보여줬다. 그런데 고객이 후기에 올릴 사진을 고르려면
  //    그 현장에서 찍은 게 다 보여야 한다. 전부 내려준다(현장당 최대 10장).
  let beforePhotos: { url: string; caption: string }[] = []
  let afterPhotos: { url: string; caption: string }[] = []
  if (claim.booking_id) {
    const { data: report } = await db
      .from('reports')
      .select('id')
      .eq('booking_id', claim.booking_id)
      .maybeSingle()
    if (report?.id) {
      const { data: photos } = await db
        .from('report_photos' as never)
        .select('url, type, sort_order, caption' as never)
        .eq('report_id' as never, report.id)
        .order('sort_order' as never, { ascending: true }) as unknown as {
          data: { url: string; type: string; caption: string | null }[] | null
        }
      const rows = photos ?? []
      beforePhotos = rows.filter((p) => p.type === 'before').map((p) => ({ url: p.url, caption: p.caption || '작업 전' }))
      afterPhotos  = rows.filter((p) => p.type === 'after').map((p) => ({ url: p.url, caption: p.caption || '작업 후' }))
    }
  }

  // 감사 선물 문구 — 저장된 값은 숫자뿐이라(예: '10') 여기서 문장으로 만든다
  const rewardText =
    bizInfo.review_reward_type === 'discount_rate' && bizInfo.review_reward_description
      ? `다음 이용 시 ${bizInfo.review_reward_description}% 할인해 드려요`
      : bizInfo.review_reward_type === 'discount_amount' && bizInfo.review_reward_description
        ? `다음 이용 시 ${Number(bizInfo.review_reward_description).toLocaleString()}원 할인해 드려요`
        : null

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

        {/* 작업 전·후 사진 — 기억을 먼저 살리고, 후기에 첨부할 수 있게 저장까지 붙인다.
            사진이 붙은 후기가 훨씬 잘 읽히고 오래 남는다. */}
        {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
          <ReviewPhotos
            before={beforePhotos}
            after={afterPhotos}
            businessName={bizInfo.name}
          />
        )}

        {/* 감사 선물 안내 — 후기를 남기면 자동으로 쌓인다(사장님이 따로 보내지 않는다) */}
        {rewardText && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-1">
            <p className="text-xs font-semibold text-amber-700">후기 남겨주시면</p>
            <p className="text-sm font-medium text-amber-900">{rewardText}</p>
            <p className="text-xs text-amber-600">후기를 남기시면 자동으로 적립돼요</p>
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
            hasReward={!!rewardText}
            platformLabel={PLATFORM_LABELS[resolved.platform ?? 'naver']}
            keywordHint={keywordHint}
          />
        )}

      </div>
    </div>
  )
}
