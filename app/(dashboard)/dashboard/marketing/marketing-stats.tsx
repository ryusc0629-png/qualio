import { createServiceClient } from '@/lib/supabase/server'
import { isAiSource } from '@/lib/utils/detect-view-source'

interface MarketingStatsProps {
  businessId: string
  // 집계 기간(개월) — 페이지 상단 선택기에서 전달 (1/3/6)
  months: number
}

// 마케팅 성과 — "성적표(매출) → 핵심 레버(전환) → 진단(유입·품질)" 3층 구조로 단순화.
// 비테크 사장님이 한눈에 이해하도록 각 지표에 온보딩 설명을 붙이고, 보조 지표는 접어둔다.
export async function MarketingStats({ businessId, months }: MarketingStatsProps) {
  const db = createServiceClient()

  const now = new Date()
  // 선택한 기간의 시작(개월 수만큼 이전 달의 1일). 모든 지표가 이 창을 공유한다.
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString()
  const periodLabel = `최근 ${months}개월`

  const [quotesResult, bookingsResult, postViewsResult, monthlyPostsResult, pageViewsResult, funnelResult] = await Promise.all([
    // 견적 신청 (기간 내) — 테스트 견적 제외용으로 id·is_test 조회
    db
      .from('quotes')
      .select('id, is_test' as never)
      .eq('business_id', businessId)
      .gte('created_at', periodStart),

    // 예약 — 현재 매출(전체) + 견적→예약 전환(quote_id 있는 것) 겸용. 삭제 건 제외.
    db
      .from('bookings')
      .select('final_price, status, quote_id')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('created_at', periodStart),

    // 블로그 글 조회 (유입 소스 + 추이용)
    db
      .from('post_views')
      .select('source, viewed_at')
      .eq('business_id', businessId)
      .gte('viewed_at', periodStart),

    // 월별 발행 포스트 수 (추이 그래프의 '글 N' 표시)
    db
      .from('biz_posts')
      .select('published_at')
      .eq('business_id', businessId)
      .eq('published', true)
      .gte('published_at', periodStart),

    // 공개 페이지 방문 (견적 페이지·브랜드 홈) — 유입 소스 + 추이용. page_views 타입 미반영이라 단언 사용
    db
      .from('page_views' as never)
      .select('source, viewed_at' as never)
      .eq('business_id' as never, businessId)
      .gte('viewed_at' as never, periodStart) as unknown as Promise<{ data: { source: string; viewed_at: string }[] | null }>,

    // 견적 퍼널 이벤트 — 문의 폼 완주율(시작 → 제출) 품질 신호용. 타입 미반영이라 단언 사용
    db
      .from('quote_funnel_events' as never)
      .select('session_id, event_type' as never)
      .eq('business_id' as never, businessId)
      .gte('created_at' as never, periodStart) as unknown as Promise<{ data: { session_id: string; event_type: string }[] | null }>,
  ])

  // ── 성적표: 현재 매출(이 기간 예약 전체) ──
  // 테스트/장난 견적(is_test) 제외 — 사장님 본인 테스트·호기심 클릭이 통계를 오염시키지 않게
  const quoteRows = (quotesResult.data ?? []) as unknown as { id: string; is_test: boolean | null }[]
  const testQuoteIds = new Set(quoteRows.filter((q) => q.is_test).map((q) => q.id))
  const quoteCount = quoteRows.filter((q) => !q.is_test).length

  const bookingRows = ((bookingsResult.data ?? []) as { final_price: number | null; status: string; quote_id: string | null }[])
    .filter((b) => !(b.quote_id && testQuoteIds.has(b.quote_id)))
  // 견적(문의 폼·견적서)에서 이어진 예약만 — 2층 '견적 → 예약' 전환 퍼널용
  const quoteBookingRows = bookingRows.filter((b) => b.quote_id !== null)
  const bookingCount = quoteBookingRows.length
  const conversionRate = quoteCount > 0 ? Math.round((bookingCount / quoteCount) * 100) : 0

  // 현재 매출 — 이 기간 예약(확정·진행·완료) 전체. 견적 경유 여부와 무관하게 실제 매출을 보여준다.
  const REVENUE_STATUSES = ['confirmed', 'in_progress', 'completed']
  const revenueBookings = bookingRows.filter((b) => REVENUE_STATUSES.includes(b.status))
  const totalRevenue = revenueBookings.reduce((sum, b) => sum + (b.final_price ?? 0), 0)
  const completedRevenue = bookingRows
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + (b.final_price ?? 0), 0)
  const upcomingRevenue = totalRevenue - completedRevenue

  // ── 품질 신호: 문의 폼 완주율(시작 → 제출) ──
  // 다단계 견적 계산기는 은퇴했고 전환은 문의 폼(hero-lead-form)이 담당 → step_completed·address_entered는
  // 더 이상 안 쌓인다. 그래서 현재 폼에서 실제로 발생하는 form_started → quote_submitted로 완주율을 잰다.
  const funnelEvents = funnelResult.data ?? []
  const sessionsOf = (type: string) =>
    new Set(funnelEvents.filter((e) => e.event_type === type).map((e) => e.session_id)).size
  const startedSessions = sessionsOf('form_started')
  const submittedSessions = sessionsOf('quote_submitted')
  const completionRate = startedSessions > 0 ? Math.round((submittedSessions / startedSessions) * 100) : 0

  // ── 진단: 유입 경로(검색·AI·직접) — 사이트 전체(블로그+공개 페이지) 합산 ──
  const views = postViewsResult.data ?? []
  const pageViews = pageViewsResult.data ?? []
  const allSources: string[] = [...views.map((v) => v.source), ...pageViews.map((p) => p.source)]
  const totalViews = allSources.length
  const aiViews = allSources.filter((s) => isAiSource(s)).length
  const seoViews = allSources.filter((s) => ['google', 'naver', 'daum'].includes(s)).length
  const directOtherViews = totalViews - aiViews - seoViews

  // ── 진단: 검색·AI 유입 월별 추이(막대) + 그 달 발행 글 수 ──
  const monthlyPosts = monthlyPostsResult.data ?? []
  const monthlyMap = monthlyPosts.reduce<Record<string, number>>((acc, p) => {
    const m = p.published_at.slice(0, 7)
    acc[m] = (acc[m] ?? 0) + 1
    return acc
  }, {})
  const isSeoSource = (s: string) => ['google', 'naver', 'daum'].includes(s)
  const trendBuckets: { label: string; ai: number; seo: number; published: number }[] = []
  const trendIndex = new Map<string, number>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    trendIndex.set(key, trendBuckets.length)
    trendBuckets.push({ label: `${d.getUTCMonth() + 1}월`, ai: 0, seo: 0, published: monthlyMap[key] ?? 0 })
  }
  const tallyTrend = (source: string, at: string | null) => {
    if (!at) return
    const idx = trendIndex.get(at.slice(0, 7))
    if (idx === undefined) return
    if (isAiSource(source)) trendBuckets[idx].ai++
    else if (isSeoSource(source)) trendBuckets[idx].seo++
  }
  for (const v of views) tallyTrend(v.source, v.viewed_at)
  for (const p of pageViews) tallyTrend(p.source, p.viewed_at)
  const trendMax = trendBuckets.reduce((m, x) => Math.max(m, x.ai + x.seo), 0)
  const trendTotal = trendBuckets.reduce((s, m) => s + m.ai + m.seo, 0)

  return (
    <div className="space-y-4">
      {/* ── 1층 성적표: 현재 매출(이 기간 예약 전체) ── */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🎉</span>
          <p className="text-sm font-semibold text-emerald-800">퀄리오로 운영하며 만든 매출</p>
          <span className="text-xs text-emerald-600/70">· {periodLabel}</span>
        </div>
        <p className="mt-2 text-3xl font-extrabold text-emerald-700 tracking-tight">
          ₩{totalRevenue.toLocaleString('ko-KR')}
        </p>
        {totalRevenue > 0 ? (
          <>
            <p className="mt-1.5 text-sm text-emerald-900/80">
              이 기간에 확정·완료된 <b>예약 매출</b>이에요
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
            아직 이 기간에 매출이 없어요. 예약이 확정되면 여기에 매출이 쌓여요.
          </p>
        )}
        <p className="mt-3 pt-3 border-t border-emerald-100 text-xs text-emerald-900/60 leading-relaxed">
          이 기간에 잡힌 예약(확정·진행·완료)의 매출 합계예요. 퀄리오에서 관리하는 실제 매출이에요.
        </p>
      </div>

      {/* ── 2층 핵심 레버: 전환(매일 볼 곳) ── */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
          <p className="font-semibold text-sm">여기에 집중하세요 — 견적을 예약으로</p>
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
        </div>
        <div className="grid grid-cols-3 divide-x">
          <div className="px-2 py-5 text-center">
            <p className="text-2xl font-bold">{quoteCount}</p>
            <p className="text-xs text-muted-foreground mt-1">견적 신청</p>
          </div>
          <div className="px-2 py-5 text-center">
            <p className="text-2xl font-bold">{bookingCount}</p>
            <p className="text-xs text-muted-foreground mt-1">예약 전환</p>
          </div>
          <div className="px-2 py-5 text-center">
            <p className="text-2xl font-bold text-primary">{conversionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">예약 전환율</p>
          </div>
        </div>
        <div className="px-5 py-3 border-t bg-slate-50/50">
          <p className="text-xs text-muted-foreground leading-relaxed">
            방문자를 늘리는 것보다 <b className="text-foreground">이미 들어온 문의를 예약으로 바꾸는 것</b>이 매출을 가장 크게 올려요.
            이 전환율을 올리는 데 집중하세요.
          </p>
        </div>
      </div>

      {/* ── 3층 진단: 어디서 들어오나·어디서 멈추나 (접이식) ── */}
      <details className="group">
        <summary className="cursor-pointer list-none select-none rounded-xl border bg-slate-50 px-5 py-3.5 flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground hover:bg-slate-100 transition-colors">
          <span>📊 자세히 보기 <span className="text-muted-foreground/60 font-normal">· 어디서 들어오나·어디서 멈추나</span></span>
          <span className="text-xs shrink-0">
            <span className="group-open:hidden">펼치기 ▾</span>
            <span className="hidden group-open:inline">접기 ▴</span>
          </span>
        </summary>
        <div className="space-y-4 pt-4">

          {/* 검색·AI 유입 + 월별 추이 */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-5 py-3 border-b bg-slate-50">
              <p className="font-semibold text-sm">어디서 들어오나 — 검색·AI 유입</p>
            </div>
            <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-100 flex items-start gap-1.5">
              <span className="text-sm leading-none mt-0.5" aria-hidden>💚</span>
              <p className="text-xs text-emerald-800 font-medium leading-relaxed">
                광고비 <b>0원</b> — 자동 포스팅만으로 검색·AI가 스스로 데려온 손님이에요
              </p>
            </div>
            <div className="grid grid-cols-3 divide-x">
              <div className="px-2 py-4 text-center">
                <p className="text-xl font-bold text-emerald-600">{aiViews.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">AI 검색</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">ChatGPT·Perplexity</p>
              </div>
              <div className="px-2 py-4 text-center">
                <p className="text-xl font-bold text-blue-600">{seoViews.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">일반 검색</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">네이버·구글·다음</p>
              </div>
              <div className="px-2 py-4 text-center">
                <p className="text-xl font-bold text-slate-500">{directOtherViews.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">직접·기타</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">링크·SNS·즐겨찾기</p>
              </div>
            </div>

            {/* 월별 추이 — AI=초록·일반검색=파랑, 아래 숫자는 그 달 발행 글 수 */}
            {trendBuckets.length >= 2 && (
              <div className="border-t p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  {trendTotal === 0
                    ? '아직 검색·AI로 들어온 방문이 없어요. 글이 색인되면 여기에 쌓여요'
                    : '글이 쌓일수록 검색·AI로 찾아오는 고객이 늘어요'}
                </p>
                <div className="flex items-end justify-between gap-2 pt-1">
                  {trendBuckets.map((m) => {
                    const total = m.ai + m.seo
                    const heightPct = trendMax > 0 ? Math.max((total / trendMax) * 100, total > 0 ? 8 : 0) : 0
                    return (
                      <div key={m.label} className="group/bar relative flex-1 flex flex-col items-center gap-1.5 min-w-0">
                        {total > 0 && (
                          <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 z-10 hidden group-hover/bar:block whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg">
                            <span className="text-emerald-300">AI {m.ai.toLocaleString()}</span>
                            <span className="text-white/40"> · </span>
                            <span className="text-blue-300">검색 {m.seo.toLocaleString()}</span>
                          </div>
                        )}
                        <span className="text-[11px] font-bold tabular-nums text-foreground">
                          {total > 0 ? total.toLocaleString() : ''}
                        </span>
                        <div className="w-full h-24 flex items-end">
                          <div className="w-full rounded-t overflow-hidden flex flex-col justify-end min-h-0" style={{ height: `${heightPct}%` }}>
                            {m.ai > 0 && <div className="w-full bg-emerald-500" style={{ height: `${(m.ai / total) * 100}%` }} />}
                            {m.seo > 0 && <div className="w-full bg-blue-500" style={{ height: `${(m.seo / total) * 100}%` }} />}
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{m.label}</span>
                        <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                          {m.published > 0 ? `글 ${m.published}` : '·'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-2 border-t">
                  <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />AI 검색</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />일반 검색</span>
                  <span className="text-muted-foreground/70">· 아래 숫자는 그 달 발행한 글 수</span>
                </div>
              </div>
            )}
          </div>

          {/* 품질 신호 — 문의 폼 완주율(시작 대비 제출). 우리판 '체류시간' */}
          {startedSessions > 0 && (
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="px-5 py-3 border-b bg-slate-50">
                <p className="font-semibold text-sm">문의 폼 완주율</p>
                <p className="text-xs text-muted-foreground mt-0.5">폼을 열어본 사람 중 실제로 문의를 보낸 비율</p>
              </div>
              <div className="p-5">
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-primary">{completionRate}%</p>
                  <p className="text-sm text-muted-foreground">
                    시작 {startedSessions}명 중 <b className="text-foreground">{submittedSessions}명</b> 제출
                  </p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(completionRate, 100)}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground/80 pt-3 leading-relaxed">
                  네이버의 ‘체류시간’처럼, 문의 폼을 끝까지 채우는 비율이 우리 폼의 설득력을 보여주는 품질 신호예요.
                  낮으면 폼이 길거나 어렵진 않은지 점검해요.
                </p>
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
