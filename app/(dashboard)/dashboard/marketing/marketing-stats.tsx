import { createServiceClient } from '@/lib/supabase/server'
import { SOURCE_LABELS, isAiSource } from '@/lib/utils/detect-view-source'
import type { ViewSource } from '@/lib/utils/detect-view-source'
import { ALL_CHANNELS, AD_CHANNELS, channelLabel } from '@/lib/utils/marketing-channels'
import { getReviewSummary } from '@/lib/reviews/get-reviews'
import { StatsCharts } from './stats-charts'

interface MarketingStatsProps {
  businessId: string
  // 집계 기간(개월) — 페이지 상단 선택기에서 전달 (1/3/6)
  months: number
}

export async function MarketingStats({ businessId, months }: MarketingStatsProps) {
  const db = createServiceClient()

  const now = new Date()
  // 선택한 기간의 시작(개월 수만큼 이전 달의 1일). 모든 지표가 이 창을 공유한다.
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString()
  const periodLabel = `최근 ${months}개월`

  const [quotesResult, bookingsResult, postViewsResult, monthlyPostsResult, reviewResult, claimsResult, pageViewsResult, funnelResult] = await Promise.all([
    // 견적 신청 수 (기간 내) — 퍼널 '견적 받기' 단계 겸용
    db
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', periodStart),

    // 예약 (quote_id 있는 것만 — 마케팅 유입 전환). 건수 + 매출 + 채널 귀속 겸용
    db
      .from('bookings')
      .select('final_price, status, quote_id')
      .eq('business_id', businessId)
      .not('quote_id', 'is', null)
      .gte('created_at', periodStart),

    // 조회 기록 (소스 + 포스트 제목)
    db
      .from('post_views')
      .select('source, post_id, viewed_at, biz_posts!post_views_post_id_fkey(title)')
      .eq('business_id', businessId)
      .gte('viewed_at', periodStart)
      .order('viewed_at', { ascending: false }),

    // 월별 발행 포스트 수
    db
      .from('biz_posts')
      .select('published_at')
      .eq('business_id', businessId)
      .eq('published', true)
      .gte('published_at', periodStart),

    // 후기 요청 현황
    db
      .from('bookings')
      .select('id, auto_review_sent_at, auto_review_followup_sent_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('scheduled_at', periodStart),

    // 후기 인증 클릭 수
    db
      .from('review_claims')
      .select('id, claimed_at')
      .eq('business_id', businessId)
      .gte('sent_at', periodStart),

    // 공개 페이지 방문 (견적 페이지·브랜드 홈) — page_views 타입 미반영이라 단언 사용
    db
      .from('page_views' as never)
      .select('source, page_type, channel' as never)
      .eq('business_id' as never, businessId)
      .gte('viewed_at' as never, periodStart) as unknown as Promise<{ data: { source: string; page_type: string; channel: string | null }[] | null }>,

    // 견적 퍼널 이벤트 (전체 여정) — 타입 미반영이라 단언 사용
    db
      .from('quote_funnel_events' as never)
      .select('session_id, event_type, step, meta, channel' as never)
      .eq('business_id' as never, businessId)
      .gte('created_at' as never, periodStart) as unknown as Promise<{ data: { session_id: string; event_type: string; step: string | null; meta: Record<string, string | number> | null; channel: string | null }[] | null }>,
  ])

  const quoteCount = quotesResult.count ?? 0
  // 마케팅 유입(견적)에서 나온 예약들 — 건수 + 매출 + 채널 귀속
  const bookingRows = (bookingsResult.data ?? []) as { final_price: number | null; status: string; quote_id: string | null }[]
  const bookingCount = bookingRows.length
  const conversionRate = quoteCount > 0 ? Math.round((bookingCount / quoteCount) * 100) : 0
  // 퀄리오가 만든 매출 — 취소·노쇼 제외한 예약 매출(실현+예정), 그중 이미 완료분 별도 표시
  const REVENUE_STATUSES = ['confirmed', 'in_progress', 'completed']
  const revenueBookings = bookingRows.filter((b) => REVENUE_STATUSES.includes(b.status))
  const attributedRevenue = revenueBookings.reduce((sum, b) => sum + (b.final_price ?? 0), 0)
  const completedRevenue = bookingRows
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + (b.final_price ?? 0), 0)
  const upcomingRevenue = attributedRevenue - completedRevenue

  // 채널별 매출 — 견적 제출 이벤트(quote_submitted)의 meta.quoteId↔channel로 예약 매출을 귀속
  // (블로그 글 CTA는 ?ch=post 로 태그돼 '자동발행 글'로 잡힘)
  const funnelRows = funnelResult.data ?? []
  const quoteIdToChannel = new Map<string, string | null>()
  for (const e of funnelRows) {
    if (e.event_type !== 'quote_submitted') continue
    const qid = e.meta && typeof e.meta.quoteId === 'string' ? e.meta.quoteId : null
    if (qid) quoteIdToChannel.set(qid, e.channel ?? null)
  }
  const channelRevenueMap = new Map<string, number>()
  for (const b of revenueBookings) {
    const ch = (b.quote_id && quoteIdToChannel.get(b.quote_id)) || '직접·기타'
    channelRevenueMap.set(ch, (channelRevenueMap.get(ch) ?? 0) + (b.final_price ?? 0))
  }
  const channelRevenue = Array.from(channelRevenueMap.entries())
    .map(([channel, amount]) => ({ channel, amount, label: channel === '직접·기타' ? '직접·기타' : channelLabel(channel) }))
    .sort((a, b) => b.amount - a.amount)

  // 후기 요청 현황
  const completedBookings = reviewResult.data ?? []
  const reviewSentCount = completedBookings.filter((b) => b.auto_review_sent_at).length
  const reviewFollowupCount = completedBookings.filter((b) => b.auto_review_followup_sent_at).length
  const claims = claimsResult.data ?? []
  const claimedCount = claims.filter((c) => c.claimed_at).length
  // 수집·전시 중인 실제 후기 요약 (누적) — 평균 별점·개수
  const reviewSummary = await getReviewSummary(db, businessId, 1)

  const views = postViewsResult.data ?? []        // 블로그(post_views)
  const pageViews = pageViewsResult.data ?? []      // 공개 페이지(page_views)

  // 페이지별 방문 수 (선택 기간)
  const blogViews = views.length
  const brandHomeViews = pageViews.filter((p) => p.page_type === 'brand_home').length
  const quoteViews = pageViews.filter((p) => p.page_type === 'quote').length

  // ── 채널별 유입 (선택 기간) — ?ch= 태그가 붙은 홍보 링크로 들어온 방문만 채널별 집계 ──
  const channelCounts = pageViews.reduce<Record<string, number>>((acc, p) => {
    if (!p.channel) return acc // 태그 없는 직접·검색 유입은 위 '검색·AI 유입'에서 다룸
    acc[p.channel] = (acc[p.channel] ?? 0) + 1
    return acc
  }, {})
  const channelStats = ALL_CHANNELS
    .map((c) => ({ key: c.key, label: c.label, emoji: c.emoji, count: channelCounts[c.key] ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
  const channelTaggedTotal = channelStats.reduce((s, c) => s + c.count, 0)
  const channelMax = channelStats.reduce((m, c) => Math.max(m, c.count), 0)

  // ── 광고 유입(유료) — 네이버 파워링크·구글 검색광고로 웹사이트에 들어온 방문 ──
  // 광고비를 쓰는 채널만 따로 강조. 검수 전이거나 노출 전이면 방문 0.
  const adChannelStats = AD_CHANNELS.map((c) => ({
    key: c.key, label: c.label, emoji: c.emoji, count: channelCounts[c.key] ?? 0,
  }))
  const adTotal = adChannelStats.reduce((s, c) => s + c.count, 0)

  // ── 견적 퍼널 (선택 기간) — 방문 → 작성 시작 → 견적 → 열람 → 플랜 선택 → 예약 ──
  const funnelEvents = funnelResult.data ?? []
  // 이벤트별 고유 세션 수 (한 사람의 여정 = 1로 집계)
  const sessionsOf = (type: string) =>
    new Set(funnelEvents.filter((e) => e.event_type === type).map((e) => e.session_id)).size
  const startedSessions = sessionsOf('form_started')
  const quoteViewedSessions = sessionsOf('quote_viewed')
  const planSelectedSessions = sessionsOf('plan_selected')
  const addressSessions = sessionsOf('address_entered')

  // 거의 예약할 뻔한 고객 — 주소까지 입력했지만 예약 확정 안 한 세션 수 (재접촉 기회)
  const bookedSessions = new Set(
    funnelEvents.filter((e) => e.event_type === 'booking_submitted').map((e) => e.session_id),
  )
  const addressNotBooked = funnelEvents
    .filter((e) => e.event_type === 'address_entered' && !bookedSessions.has(e.session_id))
    .reduce<Set<string>>((set, e) => set.add(e.session_id), new Set()).size

  // 플랜 선호도 — plan_selected 이벤트의 meta.tier 분포 (전환 안 돼도 끌린 플랜)
  const TIER_LABELS: Record<string, string> = { good: '기본', better: '추천', best: '프리미엄' }
  const planPick = funnelEvents
    .filter((e) => e.event_type === 'plan_selected')
    .reduce<Record<string, number>>((acc, e) => {
      const tier = String(e.meta?.tier ?? '')
      if (tier) acc[tier] = (acc[tier] ?? 0) + 1
      return acc
    }, {})
  const planPickTotal = Object.values(planPick).reduce((a, b) => a + b, 0)
  const planStats = ['good', 'better', 'best']
    .map((tier) => ({ tier, label: TIER_LABELS[tier], count: planPick[tier] ?? 0 }))
    .filter((p) => p.count > 0)

  // 채팅 단계별 통과 고유 세션 수 — "어느 질문에서 멈추나" 이탈 분석
  const STEP_ORDER = ['service', 'space', 'ac_detail', 'unit_variant', 'unit_detail', 'context', 'date', 'notes', 'name', 'phone'] as const
  const STEP_LABELS: Record<string, string> = {
    service: '서비스 선택', space: '평수 입력', ac_detail: '에어컨 선택',
    unit_variant: '구분 선택', unit_detail: '항목 선택', context: '주거 형태',
    date: '날짜 선택', notes: '요청사항', name: '이름 입력', phone: '연락처 입력',
  }
  const stepSessionSets = new Map<string, Set<string>>()
  for (const e of funnelEvents) {
    if (e.event_type !== 'step_completed' || !e.step) continue
    if (!stepSessionSets.has(e.step)) stepSessionSets.set(e.step, new Set())
    stepSessionSets.get(e.step)!.add(e.session_id)
  }
  const stepStats = STEP_ORDER
    .map((step) => ({ step, label: STEP_LABELS[step], count: stepSessionSets.get(step)?.size ?? 0 }))
    .filter((s) => s.count > 0)
  const stepMax = stepStats.reduce((m, s) => Math.max(m, s.count), 0)

  // 퍼널 전체 여정 — 방문 → 작성 시작 → 견적 받기 → 견적서 열람 → 플랜 선택 → 예약
  const funnelStages = [
    { label: '견적 페이지 방문', sub: '견적 화면을 열어본 횟수',   count: quoteViews,           tone: 'text-foreground' },
    { label: '견적 작성 시작',   sub: '첫 질문에 답하기 시작',     count: startedSessions,      tone: 'text-blue-600' },
    { label: '견적 받기 완료',   sub: '견적서까지 받음',           count: quoteCount,           tone: 'text-blue-600' },
    { label: '견적서 열람',      sub: '받은 견적서를 다시 열어봄', count: quoteViewedSessions,  tone: 'text-emerald-600' },
    { label: '플랜 선택',        sub: '플랜을 눌러봄(구매 직전)',   count: planSelectedSessions, tone: 'text-emerald-600' },
    { label: '예약 완료',        sub: '실제 예약으로 전환',         count: bookingCount,         tone: 'text-primary' },
  ]
  const funnelTop = funnelStages[0].count
  const hasFunnelData = funnelStages.some((s) => s.count > 0)

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

  // 월별 발행 추이 (선택 기간만큼의 월 버킷)
  const posts = monthlyPostsResult.data ?? []
  interface MonthlyCount { month: string; count: number }
  const monthlyMap = posts.reduce<Record<string, number>>((acc, p) => {
    const m = p.published_at.slice(0, 7)  // 'YYYY-MM'
    acc[m] = (acc[m] ?? 0) + 1
    return acc
  }, {})
  const monthlyData: MonthlyCount[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    const label = `${d.getUTCMonth() + 1}월`
    monthlyData.push({ month: label, count: monthlyMap[key] ?? 0 })
  }

  return (
    <div className="space-y-5">
      {/* 퀄리오가 만든 매출 — 마케팅 유입(견적)에서 나온 예약 매출. ROI를 한눈에 */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🎉</span>
          <p className="text-sm font-semibold text-emerald-800">퀄리오가 만든 매출</p>
          <span className="text-xs text-emerald-600/70">· {periodLabel}</span>
        </div>
        <p className="mt-2 text-3xl font-extrabold text-emerald-700 tracking-tight">
          ₩{attributedRevenue.toLocaleString('ko-KR')}
        </p>
        {attributedRevenue > 0 ? (
          <>
            <p className="mt-1.5 text-sm text-emerald-900/80">
              견적 <b>{quoteCount}건</b>이 예약 <b>{bookingCount}건</b>·매출로 이어졌어요
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/70 border border-emerald-100 px-2.5 py-1 text-emerald-700">
                이미 완료 <b>₩{completedRevenue.toLocaleString('ko-KR')}</b>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/70 border border-emerald-100 px-2.5 py-1 text-emerald-700/80">
                예정 <b>₩{upcomingRevenue.toLocaleString('ko-KR')}</b>
              </span>
            </div>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-emerald-900/70">
            아직 매출로 이어진 예약이 없어요. 홍보 링크를 공유하고 견적을 받으면 여기에 매출이 쌓여요.
          </p>
        )}
      </div>

      {/* 채널별 매출 — 어디서 온 견적이 매출이 됐는지(자동발행 글·네이버·당근 등) */}
      {channelRevenue.length > 0 && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
            <p className="font-semibold text-sm">채널별 매출</p>
            <p className="text-xs text-muted-foreground">어디서 온 예약이 매출이 됐나</p>
          </div>
          <div className="p-4 space-y-2.5">
            {channelRevenue.map((c) => {
              const pct = attributedRevenue > 0 ? Math.round((c.amount / attributedRevenue) * 100) : 0
              return (
                <div key={c.channel} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{c.label}</span>
                    <span className="font-semibold text-emerald-700">₩{c.amount.toLocaleString('ko-KR')}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(pct, c.amount > 0 ? 6 : 0)}%` }} />
                  </div>
                </div>
              )
            })}
            <p className="text-xs text-muted-foreground pt-1">
              자동 발행 블로그 글에서 온 예약은 &lsquo;자동발행 글&rsquo;로 잡혀요.
            </p>
          </div>
        </div>
      )}

      {/* 상단 지표 카드 — 견적/전환 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-white p-4 space-y-0.5">
          <p className="text-2xl font-bold text-primary">{quoteCount}</p>
          <p className="text-xs text-muted-foreground">{periodLabel} 견적 신청</p>
        </div>
        <div className="rounded-xl border bg-white p-4 space-y-0.5">
          <p className="text-2xl font-bold">{conversionRate}%</p>
          <p className="text-xs text-muted-foreground">견적 → 예약 전환율</p>
        </div>
      </div>

      {/* 견적 퍼널 — 방문 → 작성 시작 → 견적 받기 → 예약, 단계마다 얼마나 남는지 */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
          <p className="font-semibold text-sm">견적 신청 단계별 흐름</p>
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
        </div>

        {hasFunnelData ? (
          <div className="p-4 space-y-2.5">
            {funnelStages.map((stage, i) => {
              // 막대 너비: 1단계(방문) 대비 비율. 직전 단계 대비 전환율도 함께 표시
              const widthPct = funnelTop > 0 ? Math.max((stage.count / funnelTop) * 100, stage.count > 0 ? 8 : 0) : 0
              const prev = i > 0 ? funnelStages[i - 1].count : null
              const stepRate = prev && prev > 0 ? Math.round((stage.count / prev) * 100) : null
              return (
                <div key={stage.label} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm font-semibold truncate">{stage.label}</span>
                      {stepRate !== null && (
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          이전 단계의 {stepRate}%
                        </span>
                      )}
                    </div>
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${stage.tone}`}>
                      {stage.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/80 rounded-full transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground/80">{stage.sub}</p>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-5 py-8 text-center space-y-1">
            <p className="text-sm text-muted-foreground">아직 견적 신청 흐름 데이터가 없어요</p>
            <p className="text-xs text-muted-foreground/70">
              고객이 견적 페이지에서 신청을 시작하면 단계별로 쌓여요
            </p>
          </div>
        )}

        {/* 거의 예약할 뻔한 고객 — 재접촉하면 전환 가능 */}
        {addressNotBooked > 0 && (
          <div className="border-t px-5 py-3 bg-amber-50/60 flex items-start gap-2">
            <span className="text-base shrink-0">📞</span>
            <p className="text-xs text-amber-900 leading-relaxed">
              주소까지 입력하고 예약은 안 한 고객이 <b>{addressNotBooked}명</b> 있어요.
              조금만 더 안내하면 예약으로 이어질 수 있어요.
            </p>
          </div>
        )}

        {/* 채팅 단계별 이탈 — 어느 질문에서 많이 멈추는지 */}
        {stepStats.length > 0 && (
          <div className="border-t px-4 py-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              질문별 진행 — 막대가 줄어드는 곳이 이탈 지점이에요
            </p>
            {stepStats.map((s) => {
              const widthPct = stepMax > 0 ? Math.max((s.count / stepMax) * 100, 8) : 0
              return (
                <div key={s.step} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0 truncate">{s.label}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="text-xs font-medium tabular-nums w-7 text-right shrink-0">{s.count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 플랜 선호도 — 고객이 어떤 플랜에 끌리는지(예약 전환 전 클릭 기준) */}
      {planStats.length > 0 && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
            <p className="font-semibold text-sm">플랜 선호도</p>
            <p className="text-xs text-muted-foreground">고객이 눌러본 플랜 · {periodLabel}</p>
          </div>
          <div className="p-4 space-y-2.5">
            {planStats.map((p) => {
              const pct = planPickTotal > 0 ? Math.round((p.count / planPickTotal) * 100) : 0
              return (
                <div key={p.tier} className="flex items-center gap-2">
                  <span className="text-xs font-medium w-12 shrink-0">{p.label}</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.max(pct, p.count > 0 ? 6 : 0)}%` }} />
                  </div>
                  <span className="text-xs font-medium tabular-nums w-14 text-right shrink-0">{p.count}회 ({pct}%)</span>
                </div>
              )
            })}
            <p className="text-[11px] text-muted-foreground/80 pt-1">
              많이 눌리는 플랜의 구성·가격이 고객 눈높이에 맞다는 신호예요
            </p>
          </div>
        </div>
      )}

      {/* 유입 경로 — 검색·AI 유입을 핵심 지표로 강조, 직접·기타는 보조로 */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
          <p className="font-semibold text-sm">검색·AI 유입</p>
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
        </div>
        {/* 핵심: AI 검색 + 일반 검색 (검색으로 새로 찾아온 고객) */}
        <div className="grid grid-cols-2 divide-x">
          <div className="px-2 py-5 text-center">
            <p className="text-2xl font-bold text-emerald-600">{aiViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">AI 검색</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">ChatGPT·Perplexity</p>
          </div>
          <div className="px-2 py-5 text-center">
            <p className="text-2xl font-bold text-blue-600">{seoViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">일반 검색</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">네이버·구글·다음</p>
          </div>
        </div>
        {/* 보조: 직접·링크·SNS 유입 (작게) */}
        <div className="px-5 py-2.5 border-t bg-slate-50/50 flex items-center justify-between text-xs text-muted-foreground">
          <span>그 외 직접·링크·SNS 방문</span>
          <span className="font-medium">{directOtherViews.toLocaleString()}회</span>
        </div>
      </div>

      {/* 광고 유입(유료) — 네이버 파워링크·구글 검색광고로 웹사이트에 들어온 방문. 광고비 쓴 채널만 강조 */}
      {adTotal > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.03] overflow-hidden">
          <div className="px-5 py-3 border-b border-primary/20 bg-primary/5 flex items-baseline justify-between gap-2">
            <p className="font-semibold text-sm">💳 광고 유입</p>
            <p className="text-xs text-muted-foreground">네이버·구글 검색광고 · {periodLabel}</p>
          </div>
          <div className="grid grid-cols-2 divide-x">
            {adChannelStats.map((c) => (
              <div key={c.key} className="px-2 py-5 text-center">
                <p className="text-2xl font-bold text-primary">{c.count.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.emoji} {c.label}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">웹사이트 방문</p>
              </div>
            ))}
          </div>
          <p className="px-5 py-2.5 border-t border-primary/15 bg-primary/[0.04] text-xs text-muted-foreground leading-relaxed">
            광고로 웹사이트에 들어온 방문이 모두 <b className="text-primary">{adTotal.toLocaleString()}회</b>예요.
            이 중 몇 건이 매출로 이어졌는지는 위 &lsquo;채널별 매출&rsquo;에서 확인하세요.
          </p>
        </div>
      )}

      {/* 채널별 유입 — 홍보 링크(?ch=)로 들어온 방문을 채널별로 분리 (네이버·당근·인스타 등) */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
          <p className="font-semibold text-sm">채널별 유입</p>
          <p className="text-xs text-muted-foreground">홍보 링크 기준 · {periodLabel}</p>
        </div>
        {channelStats.length > 0 ? (
          <div className="p-4 space-y-2.5">
            {channelStats.map((c) => {
              const pct = channelTaggedTotal > 0 ? Math.round((c.count / channelTaggedTotal) * 100) : 0
              const widthPct = channelMax > 0 ? Math.max((c.count / channelMax) * 100, 8) : 0
              return (
                <div key={c.key} className="flex items-center gap-2">
                  <span className="text-base shrink-0" aria-hidden>{c.emoji}</span>
                  <span className="text-xs font-medium w-24 shrink-0 truncate">{c.label}</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary/80 rounded-full" style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="text-xs font-medium tabular-nums w-16 text-right shrink-0">
                    {c.count}회 ({pct}%)
                  </span>
                </div>
              )
            })}
            <p className="text-[11px] text-muted-foreground/80 pt-1">
              가장 많이 들어온 채널에 홍보를 집중하면 효율이 올라가요
            </p>
          </div>
        ) : (
          <div className="px-5 py-8 text-center space-y-1">
            <p className="text-sm text-muted-foreground">아직 채널 링크로 들어온 방문이 없어요</p>
            <p className="text-xs text-muted-foreground/70">
              위 &lsquo;채널별 홍보 링크&rsquo;를 복사해 네이버·당근·인스타에 올리면 채널별로 쌓여요
            </p>
          </div>
        )}
      </div>

      {/* 페이지별 방문 — 브랜드 홈 / 견적 페이지 / 블로그 글 */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
          <p className="font-semibold text-sm">페이지별 방문</p>
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
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
        <div className="px-5 py-3.5 border-b bg-slate-50 flex items-center justify-between gap-2">
          <p className="font-semibold text-sm">{periodLabel} 후기 요청 현황</p>
          {reviewSummary.count > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
              ⭐ {reviewSummary.avg.toFixed(1)} · 후기 {reviewSummary.count}개
            </span>
          )}
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
