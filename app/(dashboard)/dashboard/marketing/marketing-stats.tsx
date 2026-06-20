import { createServiceClient } from '@/lib/supabase/server'
import { SOURCE_LABELS, isAiSource } from '@/lib/utils/detect-view-source'
import type { ViewSource } from '@/lib/utils/detect-view-source'
import { StatsCharts } from './stats-charts'

interface MarketingStatsProps {
  businessId: string
}

export async function MarketingStats({ businessId }: MarketingStatsProps) {
  const db = createServiceClient()

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString()

  const [quotesResult, bookingsResult, postViewsResult, monthlyPostsResult, reviewResult, claimsResult, pageViewsResult] = await Promise.all([
    // 이번 달 견적 신청 수
    db
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', monthStart),

    // 이번 달 예약 수 (quote_id 있는 것만 — 마케팅 유입 전환)
    db
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .not('quote_id', 'is', null)
      .gte('created_at', monthStart),

    // 최근 6개월 조회 기록 (소스 + 포스트 제목)
    db
      .from('post_views')
      .select('source, post_id, viewed_at, biz_posts!post_views_post_id_fkey(title)')
      .eq('business_id', businessId)
      .gte('viewed_at', sixMonthsAgo)
      .order('viewed_at', { ascending: false }),

    // 최근 6개월 월별 발행 포스트 수
    db
      .from('biz_posts')
      .select('published_at')
      .eq('business_id', businessId)
      .eq('published', true)
      .gte('published_at', sixMonthsAgo),

    // 이번 달 후기 요청 현황
    db
      .from('bookings')
      .select('id, auto_review_sent_at, auto_review_followup_sent_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('scheduled_at', monthStart),

    // 이번 달 후기 인증 클릭 수
    db
      .from('review_claims')
      .select('id, claimed_at')
      .eq('business_id', businessId)
      .gte('sent_at', monthStart),

    // 최근 6개월 공개 페이지 방문 (견적 페이지·브랜드 홈) — page_views 타입 미반영이라 단언 사용
    db
      .from('page_views' as never)
      .select('source, page_type' as never)
      .eq('business_id' as never, businessId)
      .gte('viewed_at' as never, sixMonthsAgo) as unknown as Promise<{ data: { source: string; page_type: string }[] | null }>,
  ])

  const quoteCount = quotesResult.count ?? 0
  const bookingCount = bookingsResult.count ?? 0
  const conversionRate = quoteCount > 0 ? Math.round((bookingCount / quoteCount) * 100) : 0

  // 후기 요청 현황
  const completedBookings = reviewResult.data ?? []
  const reviewSentCount = completedBookings.filter((b) => b.auto_review_sent_at).length
  const reviewFollowupCount = completedBookings.filter((b) => b.auto_review_followup_sent_at).length
  const claims = claimsResult.data ?? []
  const claimedCount = claims.filter((c) => c.claimed_at).length

  const views = postViewsResult.data ?? []        // 블로그(post_views)
  const pageViews = pageViewsResult.data ?? []      // 공개 페이지(page_views)

  // 페이지별 방문 수 (최근 6개월)
  const blogViews = views.length
  const brandHomeViews = pageViews.filter((p) => p.page_type === 'brand_home').length
  const quoteViews = pageViews.filter((p) => p.page_type === 'quote').length

  // 유입 경로 — 사이트 전체(블로그+견적+브랜드 홈) 합산
  const allSources: string[] = [...views.map((v) => v.source), ...pageViews.map((p) => p.source)]
  const totalViews = allSources.length
  const aiViews = allSources.filter((s) => isAiSource(s)).length
  // 일반 검색(SEO) 유입 — 네이버·구글·다음
  const seoViews = allSources.filter((s) => ['google', 'naver', 'daum'].includes(s)).length
  // 직접 방문·SNS·기타 (전체에서 AI·검색 제외)
  const directOtherViews = totalViews - aiViews - seoViews

  // 소스별 집계 (사이트 전체) — 차트용
  const sourceCounts = allSources.reduce<Partial<Record<ViewSource, number>>>((acc, s) => {
    const src = s as ViewSource
    acc[src] = (acc[src] ?? 0) + 1
    return acc
  }, {})

  // 포스트별 조회수 집계 (상위 5개)
  interface PostViewAgg { title: string; count: number }
  const postCounts = views.reduce<Record<string, PostViewAgg>>((acc, v) => {
    const post = Array.isArray(v.biz_posts) ? v.biz_posts[0] : v.biz_posts
    const title = (post as { title?: string } | null)?.title ?? '(제목 없음)'
    if (!acc[v.post_id]) acc[v.post_id] = { title, count: 0 }
    acc[v.post_id].count++
    return acc
  }, {})
  const topPosts = Object.values(postCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // 월별 발행 추이 (최근 6개월)
  const posts = monthlyPostsResult.data ?? []
  interface MonthlyCount { month: string; count: number }
  const monthlyMap = posts.reduce<Record<string, number>>((acc, p) => {
    const m = p.published_at.slice(0, 7)  // 'YYYY-MM'
    acc[m] = (acc[m] ?? 0) + 1
    return acc
  }, {})
  const monthlyData: MonthlyCount[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    const label = `${d.getUTCMonth() + 1}월`
    monthlyData.push({ month: label, count: monthlyMap[key] ?? 0 })
  }

  return (
    <div className="space-y-5">
      {/* 섹션 헤더 */}
      <div>
        <h2 className="text-base font-bold">마케팅 성과</h2>
        <p className="text-xs text-muted-foreground mt-0.5">이번 달 기준 · 조회수는 최근 6개월</p>
      </div>

      {/* 상단 지표 카드 — 견적/전환 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-white p-4 space-y-0.5">
          <p className="text-2xl font-bold text-primary">{quoteCount}</p>
          <p className="text-xs text-muted-foreground">이번 달 견적 신청</p>
        </div>
        <div className="rounded-xl border bg-white p-4 space-y-0.5">
          <p className="text-2xl font-bold">{conversionRate}%</p>
          <p className="text-xs text-muted-foreground">견적 → 예약 전환율</p>
        </div>
      </div>

      {/* 유입 경로 — AI 검색 / 일반 검색(SEO) / 직접·기타 */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
          <p className="font-semibold text-sm">유입 경로</p>
          <p className="text-xs text-muted-foreground">총 {totalViews.toLocaleString()}회 · 최근 6개월</p>
        </div>
        <div className="grid grid-cols-3 divide-x">
          <div className="px-2 py-4 text-center">
            <p className="text-xl font-bold text-emerald-600">{aiViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">AI 검색</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">ChatGPT·Perplexity</p>
          </div>
          <div className="px-2 py-4 text-center">
            <p className="text-xl font-bold text-blue-600">{seoViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">일반 검색</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">네이버·구글·다음</p>
          </div>
          <div className="px-2 py-4 text-center">
            <p className="text-xl font-bold">{directOtherViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">직접·기타</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">링크·SNS 등</p>
          </div>
        </div>
      </div>

      {/* 페이지별 방문 — 브랜드 홈 / 견적 페이지 / 블로그 글 (최근 6개월) */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
          <p className="font-semibold text-sm">페이지별 방문</p>
          <p className="text-xs text-muted-foreground">최근 6개월</p>
        </div>
        <div className="grid grid-cols-3 divide-x">
          <div className="px-2 py-4 text-center">
            <p className="text-xl font-bold">{brandHomeViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">브랜드 홈</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">업체 소개 페이지</p>
          </div>
          <div className="px-2 py-4 text-center">
            <p className="text-xl font-bold text-primary">{quoteViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">견적 페이지</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">견적 신청 화면</p>
          </div>
          <div className="px-2 py-4 text-center">
            <p className="text-xl font-bold">{blogViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">블로그 글</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">홍보 포스트</p>
          </div>
        </div>
      </div>

      {/* 후기 요청 현황 */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-slate-50">
          <p className="font-semibold text-sm">이번 달 후기 요청 현황</p>
        </div>
        <div className="grid grid-cols-4 divide-x">
          <div className="px-3 py-4 text-center">
            <p className="text-xl font-bold">{completedBookings.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">완료 건수</p>
          </div>
          <div className="px-3 py-4 text-center">
            <p className="text-xl font-bold text-blue-600">{reviewSentCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">요청 발송</p>
          </div>
          <div className="px-3 py-4 text-center">
            <p className="text-xl font-bold text-amber-600">{reviewFollowupCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">팔로업</p>
          </div>
          <div className="px-3 py-4 text-center">
            <p className="text-xl font-bold text-emerald-600">{claimedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">인증 완료</p>
          </div>
        </div>
        {completedBookings.length > 0 && reviewSentCount === 0 && (
          <p className="px-5 pb-3 text-xs text-muted-foreground">
            설정에서 구글/네이버 플레이스 URL을 등록하면 자동 발송이 시작돼요
          </p>
        )}
      </div>

      {/* 차트 (클라이언트 컴포넌트) */}
      <StatsCharts
        sourceCounts={sourceCounts as Record<string, number>}
        monthlyData={monthlyData}
        topPosts={topPosts}
        totalViews={totalViews}
      />
    </div>
  )
}
