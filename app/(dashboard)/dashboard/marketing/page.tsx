import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { PostList } from './post-list'
import { MarketingStats } from './marketing-stats'
import { ChannelLinksCard } from './channel-links-card'
import { MARKETING_CHANNELS } from '@/lib/utils/marketing-channels'
import { generateProposalQr } from '@/lib/proposal/qr'
import { ChannelPerformanceCard } from './channel-performance-card'
import { MarketingPeriodSelector } from './period-selector'
import { GeoShareCard } from '@/components/dashboard/geo-share-card'
import { checkAutoPostReadiness } from '@/lib/marketing/auto-post-readiness'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ReelInboxCard } from '@/components/dashboard/reel-inbox-card'
import { AiCrawlerCard } from '@/components/dashboard/ai-crawler-card'
import { GoogleProfileCard } from '@/components/dashboard/google-profile-card'
import { getAutoPostLimit, getAutoDailyPostLimit } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { getOrCreatePostPlan } from '@/lib/geo/post-plan'

// '지금 발행'(publishTodayAction)은 이 페이지에서 호출되는 Server Action이라
// 이 라우트의 제한시간을 따른다. scale 플랜은 심층 글 + SNS 채널 원고까지
// 생성해 1~2분 걸리므로, 저장 후 응답 전에 함수가 죽지 않도록 넉넉히 확보한다.
export const maxDuration = 300

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  // 집계 기간(개월) — 기본 3개월. 유입·퍼널 데이터가 적은 초기엔 넓게 볼 수 있도록 1/3/6 지원
  const { period } = await searchParams
  const months = period === '1' ? 1 : period === '6' ? 6 : 3

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')

  // 업체 slug + 포스트 목록 + 구독 플랜 + 포트폴리오 초안 + 완성된 릴스 병렬 조회
  const [businessResult, postsResult, subResult, pendingPortfolioResult, doneReelsResult] = await Promise.all([
    db
      .from('businesses')
      .select('slug, name, address, monthly_post_target, topic_suggestions, topic_suggestions_month, naver_blog_id, danggeun_business_url' as never)
      .eq('id', profile.business_id)
      .maybeSingle() as unknown as { data: { slug: string | null; name: string | null; address: string | null; monthly_post_target: number; topic_suggestions: { title: string; reason: string; topic: string }[] | null; topic_suggestions_month: string | null; naver_blog_id: string | null; danggeun_business_url: string | null } | null },
    db
      .from('biz_posts' as never)
      .select('id, slug, title, content, summary, published, ai_generated, published_at, image_url, image_urls, naver_title, naver_content, naver_tags, daangn_title, daangn_content, instagram_content, instagram_hashtags, post_type, before_image_urls, after_image_urls, channel_posted_at' as never)
      .eq('business_id' as never, profile.business_id)
      .order('published_at' as never, { ascending: false }) as unknown as { data: Record<string, unknown>[] | null },
    db
      .from('subscriptions')
      .select('plan')
      .eq('business_id', profile.business_id)
      .eq('status', 'active')
      .maybeSingle(),
    db
      .from('biz_posts' as never)
      .select('id, title, content, summary, before_image_urls, after_image_urls' as never)
      .eq('business_id' as never, profile.business_id)
      .eq('post_type' as never, 'portfolio')
      .eq('published' as never, false)
      .order('created_at' as never, { ascending: false }) as unknown as {
        data: { id: string; title: string; content: string; summary: string | null; before_image_urls: string[]; after_image_urls: string[] }[] | null
      },

    // 완성된 릴스 (reel_status = 'done')
    db
      .from('reports' as never)
      .select('id, reel_url, booking_id, bookings!booking_id(customer_name, scheduled_at)' as never)
      .eq('business_id' as never, profile.business_id)
      .eq('reel_status' as never, 'done')
      .order('updated_at' as never, { ascending: false }) as unknown as {
        data: {
          id: string
          reel_url: string
          booking_id: string
          bookings: { customer_name: string; scheduled_at: string } | null
        }[] | null
      },
  ])

  const business = businessResult.data

  const doneReels = (doneReelsResult.data ?? []).map((r) => ({
    reportId: r.id,
    reelUrl: r.reel_url,
    bookingId: r.booking_id,
    customerName: r.bookings?.customer_name ?? '고객',
    scheduledAt: r.bookings?.scheduled_at ?? '',
  }))

  const posts = (postsResult.data ?? []) as unknown as {
    id: string; slug: string; title: string; content: string; summary: string | null
    published: boolean; ai_generated: boolean; published_at: string
    image_url: string | null; image_urls: string[] | null
    naver_title: string | null; naver_content: string | null; naver_tags: string[] | null
    daangn_title: string | null; daangn_content: string | null; instagram_content: string | null; instagram_hashtags: string[] | null
    post_type: string | null; before_image_urls: string[] | null; after_image_urls: string[] | null
    channel_posted_at: string | null
  }[]
  const pendingPortfolios = pendingPortfolioResult.data ?? []
  // 인쇄물 채널(전단지·명함/제안서)의 QR 그림 — 링크만 주면 사장님이 QR 만들 곳을 또 찾아야 한다.
  // 서버에서 만들어 바로 내려받게 한다(채널 태그 ?ch= 가 들어간 주소 그대로).
  const channelBaseUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'}/biz/${business?.slug ?? ''}`
  const qrChannelKeys = MARKETING_CHANNELS.filter((c) => c.needsQr).map((c) => c.key)
  const qrByChannel: Record<string, string> = {}
  if (business?.slug) {
    for (const key of qrChannelKeys) {
      const dataUrl = await generateProposalQr(`${channelBaseUrl}?ch=${key}`)
      if (dataUrl) qrByChannel[key] = dataUrl
    }
  }

  const planId = ((subResult.data?.plan as PlanId) ?? 'beta')
  const autoPostLimit = getAutoPostLimit(planId)
  const autoDailyPostLimit = getAutoDailyPostLimit(planId)

  // 오늘 KST 기준 발행 건수 → 일 한도 초과 여부 확인
  // (서버 컴포넌트라 요청마다 서버에서 한 번만 실행 — 브라우저 재렌더와 무관)
  // eslint-disable-next-line react-hooks/purity
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayKSTStr = nowKST.toISOString().slice(0, 10)
  const todayPostCount = posts.filter((p) => {
    if (!p.published) return false
    const pKST = new Date(new Date(p.published_at).getTime() + 9 * 60 * 60 * 1000)
    return pKST.toISOString().slice(0, 10) === todayKSTStr
  }).length
  const isTodayComplete = todayPostCount >= autoDailyPostLimit

  // 자동 발행 '계획표' — 이번 달 1회 확정 후 고정(달력·크론·수동 발행이 모두 이 계획을 따름).
  // 이미 발행된 KST 날짜는 계획에서 제외(그 자리엔 실제 발행 글이 표시됨).
  const monthKST = todayKSTStr.slice(0, 7)
  const todayDayKST = Number(todayKSTStr.slice(8, 10))
  const publishedDaysThisMonth = new Set<number>(
    posts
      .filter((p) => p.published && p.post_type !== 'portfolio')
      .map((p) => new Date(new Date(p.published_at).getTime() + 9 * 60 * 60 * 1000).toISOString())
      .filter((iso) => iso.slice(0, 7) === monthKST)
      .map((iso) => Number(iso.slice(8, 10)))
  )
  const postPlan = await getOrCreatePostPlan(db, profile.business_id, {
    month: monthKST,
    currentMonthNum: Number(todayKSTStr.slice(5, 7)),
    daysInMonth: new Date(Number(todayKSTStr.slice(0, 4)), Number(todayKSTStr.slice(5, 7)), 0).getDate(),
    today: todayDayKST,
    target: Math.min(business?.monthly_post_target ?? autoPostLimit, autoPostLimit),
    businessName: business?.name ?? '우리 업체',
    address: business?.address ?? null,
    publishedDays: publishedDaysThisMonth,
  })

  // 이번 달(KST) 저장된 주제가 있으면 서버에서 바로 넘겨 화면 진입 즉시 표시 (스피너·재조회 없음)
  const monthKey = `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth() + 1).padStart(2, '0')}`
  const initialSuggestions =
    business?.topic_suggestions_month === monthKey && Array.isArray(business?.topic_suggestions) && business.topic_suggestions.length > 0
      ? business.topic_suggestions
      : null

  // 자동 글쓰기를 켤 수 있는 상태인가 — 재료(서비스·지역)가 없으면 켜는 버튼을 안 보여준다
  const autoPostReadiness = await checkAutoPostReadiness(db as unknown as SupabaseClient, profile.business_id)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">마케팅 포스팅</h1>
        <p className="text-sm text-muted-foreground mt-1">
          마케팅 전문가 데이터로 홍보 글을 자동 작성합니다. 글이 쌓일수록 AI 검색엔진에 더 자주 노출됩니다.
        </p>
      </div>

      {/* ── 지금 할 일 ──
          ★글 목록보다 위에 둔다. 글 목록이 페이지의 대부분을 차지해서, 아래에 두면 여기까지
            한참 스크롤해야 하고 마케팅 메뉴를 눌렀을 때 첫 화면에 안 보인다.
            비테크 사장님은 눈에 안 보이면 안 한다 → 할 일이 먼저, 글은 그 다음.
          ⛔글 목록 아래로 되돌리지 말 것. */}
      <div className="space-y-5">
        {/* 현장이 올린 영상으로 만들어진 홍보 영상 — 대표가 확인하고 올린다 */}
        <Suspense fallback={
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground animate-pulse">
            홍보 영상을 불러오는 중...
          </div>
        }>
          <ReelInboxCard businessId={profile.business_id} />
        </Suspense>

        {business?.slug && (
          <ChannelLinksCard
            baseUrl={channelBaseUrl}
            qrByChannel={qrByChannel}
          />
        )}

        {/* 구글 지도 조건 맞추기 — 짧은 '추천' 질문은 블로그가 아니라 구글 지도가 답한다.
            ★이건 통계가 아니라 '할 일 체크리스트'다. 성과 카드들 사이에 끼워 두면 숫자를 읽던
              흐름이 끊긴다(기간 선택기도 이 카드엔 적용되지 않는다).
            ⛔성과 섹션 안으로 되돌리지 말 것. */}
        <Suspense fallback={
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground animate-pulse">
            구글 지도 조건을 확인하는 중...
          </div>
        }>
          <GoogleProfileCard businessId={profile.business_id} />
        </Suspense>

        <Link
          href="/dashboard/marketing/proposal"
          className="flex items-center justify-between rounded-xl border bg-card px-4 py-3.5 hover:bg-muted transition-colors"
        >
          <div>
            <p className="text-sm font-semibold">📄 회사 소개서 만들기</p>
            <p className="text-xs text-muted-foreground mt-0.5">업체 정보로 자동 완성 · PDF로 저장해 손님에게 보내기</p>
          </div>
          <span className="text-muted-foreground text-lg">›</span>
        </Link>
      </div>

      <PostList
        posts={posts}
        businessSlug={business?.slug ?? null}
        businessId={profile.business_id}
        monthlyTarget={business?.monthly_post_target ?? 0}
        autoPostReadiness={autoPostReadiness}
        autoPostLimit={autoPostLimit}
        planId={planId}
        isTodayComplete={isTodayComplete}
        pendingPortfolios={pendingPortfolios}
        doneReels={doneReels}
        initialSuggestions={initialSuggestions}
        naverBlogId={business?.naver_blog_id ?? null}
        danggeunBusinessUrl={business?.danggeun_business_url ?? null}
        postPlan={postPlan}
      />

      {/* ── 여기부터 '지난 결과'(통계) — 위는 '지금 할 일', 여기는 읽기만 하는 숫자 ── */}
      <div className="border-t pt-6 space-y-5">
        {/* 성과 섹션 헤더 + 집계 기간 선택 (아래 두 카드 모두에 적용) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-bold">마케팅 성과</h2>
          <MarketingPeriodSelector current={months} />
        </div>

        <Suspense fallback={
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground animate-pulse">
            성과 데이터를 불러오는 중...
          </div>
        }>
          <MarketingStats businessId={profile.business_id} months={months} />
        </Suspense>

        <Suspense fallback={
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground animate-pulse">
            채널별 성과를 불러오는 중...
          </div>
        }>
          <ChannelPerformanceCard businessId={profile.business_id} months={months} />
        </Suspense>

        {/* 크롤러 방문이 노출률보다 먼저 움직이므로 위에 둔다 — 노출률이 0인 동안에도 볼 게 있어야 한다 */}
        <Suspense fallback={
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground animate-pulse">
            AI가 읽어간 기록을 불러오는 중...
          </div>
        }>
          <AiCrawlerCard businessId={profile.business_id} />
        </Suspense>

        <Suspense fallback={
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground animate-pulse">
            AI 검색 노출률을 불러오는 중...
          </div>
        }>
          <GeoShareCard businessId={profile.business_id} />
        </Suspense>
      </div>
    </div>
  )
}
