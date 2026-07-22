import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { PostList } from './post-list'
import { MarketingStats } from './marketing-stats'
import { ChannelLinksCard } from './channel-links-card'
import { MarketingPeriodSelector } from './period-selector'
import { SearchTrafficTrend } from '@/components/dashboard/search-traffic-trend'
import { getAutoPostLimit, getAutoDailyPostLimit } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

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
      .select('slug, name, monthly_post_target, auto_image_generation, topic_suggestions, topic_suggestions_month, naver_blog_id, danggeun_business_url' as never)
      .eq('id', profile.business_id)
      .maybeSingle() as unknown as { data: { slug: string | null; name: string | null; monthly_post_target: number; auto_image_generation: boolean; topic_suggestions: { title: string; reason: string; topic: string }[] | null; topic_suggestions_month: string | null; naver_blog_id: string | null; danggeun_business_url: string | null } | null },
    db
      .from('biz_posts' as never)
      .select('id, slug, title, content, summary, published, ai_generated, published_at, image_url, image_urls, naver_title, naver_content, naver_tags, daangn_content, instagram_content, instagram_hashtags, post_type, before_image_urls, after_image_urls, channel_posted_at' as never)
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
    daangn_content: string | null; instagram_content: string | null; instagram_hashtags: string[] | null
    post_type: string | null; before_image_urls: string[] | null; after_image_urls: string[] | null
    channel_posted_at: string | null
  }[]
  const pendingPortfolios = pendingPortfolioResult.data ?? []
  const planId = ((subResult.data?.plan as PlanId) ?? 'beta')
  const autoPostLimit = getAutoPostLimit(planId)
  const autoDailyPostLimit = getAutoDailyPostLimit(planId)

  // 오늘 KST 기준 발행 건수 → 일 한도 초과 여부 확인
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayKSTStr = nowKST.toISOString().slice(0, 10)
  const todayPostCount = posts.filter((p) => {
    if (!p.published) return false
    const pKST = new Date(new Date(p.published_at).getTime() + 9 * 60 * 60 * 1000)
    return pKST.toISOString().slice(0, 10) === todayKSTStr
  }).length
  const isTodayComplete = todayPostCount >= autoDailyPostLimit

  // 이번 달(KST) 저장된 주제가 있으면 서버에서 바로 넘겨 화면 진입 즉시 표시 (스피너·재조회 없음)
  const monthKey = `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth() + 1).padStart(2, '0')}`
  const initialSuggestions =
    business?.topic_suggestions_month === monthKey && Array.isArray(business?.topic_suggestions) && business.topic_suggestions.length > 0
      ? business.topic_suggestions
      : null

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">마케팅 포스팅</h1>
        <p className="text-sm text-muted-foreground mt-1">
          마케팅 전문가 데이터로 홍보 글을 자동 작성합니다. 글이 쌓일수록 AI 검색엔진에 더 자주 노출됩니다.
        </p>
      </div>

      <PostList
        posts={posts}
        businessSlug={business?.slug ?? null}
        businessId={profile.business_id}
        monthlyTarget={business?.monthly_post_target ?? 0}
        autoPostLimit={autoPostLimit}
        planId={planId}
        isTodayComplete={isTodayComplete}
        pendingPortfolios={pendingPortfolios}
        doneReels={doneReels}
        autoImageGeneration={business?.auto_image_generation ?? true}
        initialSuggestions={initialSuggestions}
        naverBlogId={business?.naver_blog_id ?? null}
        danggeunBusinessUrl={business?.danggeun_business_url ?? null}
      />

      <div className="border-t pt-6 space-y-5">
        {business?.slug && (
          <ChannelLinksCard
            baseUrl={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'}/q/${business.slug}`}
            landingBaseUrl={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'}/biz/${business.slug}`}
          />
        )}

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
            검색·AI 유입 추이를 불러오는 중...
          </div>
        }>
          <SearchTrafficTrend businessId={profile.business_id} months={months} />
        </Suspense>
      </div>
    </div>
  )
}
