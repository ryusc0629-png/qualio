import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { QuoteLinkShare } from '@/components/dashboard/quote-link-share'
import { WeeklyChart } from '@/components/dashboard/weekly-chart'
import {
  AlertCircle, Calendar, ChevronRight, RefreshCw,
  Wallet, ClipboardList, Star, Phone,
  Users, UserPlus, AlertTriangle, TrendingUp, CheckCircle2,
  Handshake, PhoneCall, ShieldAlert,
} from 'lucide-react'

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  confirmed:   { text: '확정',    className: 'bg-primary/10 text-primary' },
  in_progress: { text: '진행 중', className: 'bg-amber-100 text-amber-800' },
  completed:   { text: '완료',    className: 'bg-green-100 text-green-800' },
  cancelled:   { text: '취소',    className: 'bg-gray-100 text-gray-500' },
  no_show:     { text: '노쇼',    className: 'bg-red-100 text-red-700' },
}

export default async function DashboardPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id, businesses!business_id(name)')
    .eq('id', user.id)
    .maybeSingle()

  const businessId = profile?.business_id
  if (!businessId) redirect('/onboarding')

  const businessName = (profile?.businesses as { name: string } | null)?.name ?? '내 업체'
  const now = new Date()

  // 날짜 범위 계산 (KST 기준)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayKSTStr = nowKST.toISOString().slice(0, 10)
  const todayKSTStart = new Date(nowKST)
  todayKSTStart.setUTCHours(0, 0, 0, 0)
  const todayStartUTC = new Date(todayKSTStart.getTime() - 9 * 60 * 60 * 1000)
  const todayEndUTC   = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000)
  const weekEndUTC    = new Date(todayStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000)

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const sevenDaysAgo   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthLabel     = `${now.getMonth() + 1}월`

  const hour     = now.getHours()
  const greeting = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '안녕하세요' : '수고하셨어요'

  const [
    { data: completedThisMonth },
    { data: completedLastMonth },
    { data: activeContracts },
    { data: todayBookings },
    { data: upcomingBookings },
    { count: pendingQuoteCount },
    { data: completedBookingIds },
    { data: reportedBookings },
    { count: unreviewedCount },
    { data: last7DaysCompleted },
    { count: totalCustomers },
    { count: newCustomersThisMonth },
    { data: pipelineBookings },
    { count: unassignedCount },
    { data: allLeads },
    { data: todayFollowUps },
  ] = await Promise.all([
    // 이번 달 완료 예약
    db.from('bookings').select('final_price')
      .eq('business_id', businessId).eq('status', 'completed')
      .is('deleted_at', null).gte('updated_at', thisMonthStart),

    // 지난달 완료 예약
    db.from('bookings').select('final_price')
      .eq('business_id', businessId).eq('status', 'completed')
      .is('deleted_at', null)
      .gte('updated_at', lastMonthStart).lt('updated_at', lastMonthEnd),

    // 활성 정기 계약
    db.from('contracts').select('contract_price')
      .eq('business_id', businessId).eq('status', 'active'),

    // 오늘 예약
    db.from('bookings')
      .select('id, customer_name, customer_phone, scheduled_at, selected_tier, final_price, status')
      .eq('business_id', businessId).is('deleted_at', null)
      .gte('scheduled_at', todayStartUTC.toISOString())
      .lt('scheduled_at', todayEndUTC.toISOString())
      .not('status', 'in', '("cancelled","completed")')
      .order('scheduled_at', { ascending: true }),

    // 이번 주 예정 예약
    db.from('bookings')
      .select('id, customer_name, scheduled_at, selected_tier, final_price, status')
      .eq('business_id', businessId).is('deleted_at', null)
      .gte('scheduled_at', todayEndUTC.toISOString())
      .lt('scheduled_at', weekEndUTC.toISOString())
      .not('status', 'in', '("cancelled","completed")')
      .order('scheduled_at', { ascending: true }).limit(5),

    // 미답변 견적 수
    db.from('quotes').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('status', 'pending'),

    // 완료 예약 ID (보고서 체크용)
    db.from('bookings').select('id')
      .eq('business_id', businessId).eq('status', 'completed').is('deleted_at', null),

    // 보고서 발송 목록
    db.from('reports').select('booking_id').eq('business_id', businessId),

    // 리뷰 미요청 수
    db.from('reports').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .not('kakao_sent_at', 'is', null).is('review_request_sent_at', null),

    // 지난 7일 완료 예약 (주간 차트용)
    db.from('bookings').select('final_price, scheduled_at')
      .eq('business_id', businessId).eq('status', 'completed')
      .is('deleted_at', null).gte('scheduled_at', sevenDaysAgo)
      .order('scheduled_at'),

    // 전체 고객 수
    db.from('customers').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId),

    // 이번 달 신규 고객
    db.from('customers').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).gte('created_at', thisMonthStart),

    // 예약 파이프라인 (확정·진행 중)
    db.from('bookings').select('id, status')
      .eq('business_id', businessId)
      .in('status', ['confirmed', 'in_progress'])
      .is('deleted_at', null),

    // 미배정 확정 예약
    db.from('bookings' as never).select('id', { count: 'exact', head: true })
      .eq('business_id' as never, businessId)
      .eq('status' as never, 'confirmed')
      .is('worker_id' as never, null)
      .is('deleted_at' as never, null),

    // 거래처 파이프라인 전체
    db.from('leads')
      .select('id, status, monthly_budget')
      .eq('business_id', businessId),

    // 오늘 연락 예정 거래처
    db.from('leads')
      .select('id, company_name, phone, contact_name, status')
      .eq('business_id', businessId)
      .eq('next_follow_up_date', todayKSTStr)
      .not('status', 'in', '("contracted","rejected")'),
  ])

  // ── 계산 ──────────────────────────────────────────────
  const monthRevenue       = (completedThisMonth ?? []).reduce((s, b) => s + (b.final_price ?? 0), 0)
  const monthCompletedCount = completedThisMonth?.length ?? 0
  const lastMonthRevenue   = (completedLastMonth ?? []).reduce((s, b) => s + (b.final_price ?? 0), 0)
  const lastMonthCount     = completedLastMonth?.length ?? 0
  const avgDealSize        = monthCompletedCount > 0 ? Math.round(monthRevenue / monthCompletedCount) : 0
  const monthlyContractRevenue = (activeContracts ?? []).reduce((s, c) => s + (c.contract_price ?? 0), 0)

  const revenueDiff    = monthRevenue - lastMonthRevenue
  const revenuePct     = lastMonthRevenue > 0 ? Math.round((revenueDiff / lastMonthRevenue) * 100) : null
  const countDiff      = monthCompletedCount - lastMonthCount

  const reportedSet    = new Set((reportedBookings ?? []).map((r) => r.booking_id))
  const unreportedCount = (completedBookingIds ?? []).filter((b) => !reportedSet.has(b.id)).length

  const confirmedCount  = (pipelineBookings ?? []).filter((b) => b.status === 'confirmed').length
  const inProgressCount = (pipelineBookings ?? []).filter((b) => b.status === 'in_progress').length

  // B2B 거래처 지표
  const activeLeads       = (allLeads ?? []).filter((l) => l.status !== 'contracted' && l.status !== 'rejected')
  const contractedLeads   = (allLeads ?? []).filter((l) => l.status === 'contracted')
  const pipelineMonthlyRevenue = contractedLeads.reduce((s, l) => s + (l.monthly_budget ?? 0), 0)
  const todayFollowUpCount = (todayFollowUps ?? []).length

  // 주간 매출 차트 데이터 (최근 7일, KST 기준)
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000)
    const dKST = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    const dateStr = dKST.toISOString().slice(0, 10)
    const revenue = (last7DaysCompleted ?? []).filter((b) => {
      const bKST = new Date(new Date(b.scheduled_at).getTime() + 9 * 60 * 60 * 1000)
      return bKST.toISOString().slice(0, 10) === dateStr
    }).reduce((s, b) => s + (b.final_price ?? 0), 0)
    return {
      date: dateStr,
      revenue,
      dayLabel: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()],
      isToday: dateStr === todayKSTStr,
    }
  })
  const maxWeeklyRevenue = Math.max(...weeklyData.map((d) => d.revenue), 1)
  const weeklyTotal = weeklyData.reduce((s, d) => s + d.revenue, 0)

  const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const quoteUrl = `${baseUrl}/q/${businessId}`

  const dateLabel = now.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  // 알림 배너 여부
  const hasAlerts = (pendingQuoteCount ?? 0) > 0 || unreportedCount > 0 ||
    (unreviewedCount ?? 0) > 0 || (unassignedCount ?? 0) > 0 || todayFollowUpCount > 0

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* 인사말 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
          <h1 className="text-2xl font-bold mt-0.5">{greeting}, {businessName}</h1>
        </div>
        <QuoteLinkShare url={quoteUrl} />
      </div>

      {/* 액션 알림 */}
      {hasAlerts && (
        <div className="space-y-2">
          {todayFollowUpCount > 0 && (
            <Link href="/dashboard/pipeline">
              <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 hover:bg-violet-100 transition-colors">
                <PhoneCall className="h-4 w-4 text-violet-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-violet-800">오늘 연락해야 할 거래처가 {todayFollowUpCount}곳 있어요</p>
                  <p className="text-xs text-violet-600 mt-0.5">거래처 관리에서 확인하세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-violet-400 shrink-0" />
              </div>
            </Link>
          )}
          {(unassignedCount ?? 0) > 0 && (
            <Link href="/dashboard/schedule">
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 hover:bg-red-100 transition-colors">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="flex-1 text-sm font-semibold text-red-800">
                  담당자가 배정되지 않은 예약이 {unassignedCount}건 있어요
                </p>
                <ChevronRight className="h-4 w-4 text-red-400 shrink-0" />
              </div>
            </Link>
          )}
          {(pendingQuoteCount ?? 0) > 0 && (
            <Link href="/dashboard/clients?type=individual">
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">확인 안 된 견적이 {pendingQuoteCount}건 있어요</p>
                  <p className="text-xs text-amber-600 mt-0.5">고객 관리에서 예약으로 확정해주세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-500 shrink-0" />
              </div>
            </Link>
          )}
          {unreportedCount > 0 && (
            <Link href="/dashboard/alimtalk-todo">
              <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 hover:bg-orange-100 transition-colors">
                <ClipboardList className="h-4 w-4 text-orange-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-orange-800">
                    작업 보고서를 안 보낸 고객이 {unreportedCount}명이에요
                  </p>
                  <p className="text-xs text-orange-600 mt-0.5">눌러서 바로 발송하세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-orange-500 shrink-0" />
              </div>
            </Link>
          )}
          {(unreviewedCount ?? 0) > 0 && (
            <Link href="/dashboard/alimtalk-todo">
              <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 hover:bg-yellow-100 transition-colors">
                <Star className="h-4 w-4 text-yellow-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-yellow-800">
                    리뷰 요청 안 보낸 고객이 {unreviewedCount}명이에요
                  </p>
                  <p className="text-xs text-yellow-600 mt-0.5">눌러서 바로 발송하세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-yellow-500 shrink-0" />
              </div>
            </Link>
          )}
        </div>
      )}

      {/* KPI 카드 4개 */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">{monthLabel} 핵심 지표</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          {/* 이번 달 매출 */}
          <Link href="/dashboard/schedule">
            <div className="bg-white rounded-xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-primary" />
                </div>
                {revenuePct !== null && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${revenuePct >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {revenuePct >= 0 ? '▲' : '▼'} {Math.abs(revenuePct)}%
                  </span>
                )}
              </div>
              <p className="text-xl font-bold tabular-nums leading-tight">
                {monthRevenue > 0 ? `${monthRevenue.toLocaleString('ko-KR')}원` : '—'}
              </p>
              <p className="text-xs font-medium text-muted-foreground mt-1">{monthLabel} 매출</p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {revenuePct !== null
                  ? `전월 대비 ${revenueDiff >= 0 ? '+' : ''}${Math.round(revenueDiff / 10000)}만원`
                  : '완료된 예약 기준'}
              </p>
            </div>
          </Link>

          {/* 완료 건수 */}
          <Link href="/dashboard/schedule">
            <div className="bg-white rounded-xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                {lastMonthCount > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${countDiff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {countDiff >= 0 ? '▲' : '▼'} {Math.abs(countDiff)}건
                  </span>
                )}
              </div>
              <p className="text-xl font-bold tabular-nums leading-tight">{monthCompletedCount}건</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">{monthLabel} 완료</p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">청소 완료한 건수</p>
            </div>
          </Link>

          {/* 평균 단가 */}
          <div className="bg-white rounded-xl border border-border p-4 h-full">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-violet-600" />
              </div>
            </div>
            <p className="text-xl font-bold tabular-nums leading-tight">
              {avgDealSize > 0 ? `${avgDealSize.toLocaleString('ko-KR')}원` : '—'}
            </p>
            <p className="text-xs font-medium text-muted-foreground mt-1">평균 단가</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{monthLabel} 완료 예약 기준</p>
          </div>

          {/* 정기 계약 */}
          <Link href="/dashboard/clients">
            <div className="bg-white rounded-xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
                  <RefreshCw className="h-4 w-4 text-teal-600" />
                </div>
              </div>
              <p className="text-xl font-bold tabular-nums leading-tight">
                {monthlyContractRevenue > 0
                  ? `${monthlyContractRevenue.toLocaleString('ko-KR')}원`
                  : '—'}
              </p>
              <p className="text-xs font-medium text-muted-foreground mt-1">정기 계약 매출/월</p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {activeContracts && activeContracts.length > 0
                  ? `${activeContracts.length}건 계약 진행 중`
                  : '아직 정기 계약이 없어요'}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* 오늘 할 일 KPI */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/dashboard/clients?type=individual">
          <div className={`rounded-xl border p-4 hover:shadow-sm transition-all h-full ${(pendingQuoteCount ?? 0) > 0 ? 'bg-amber-50 border-amber-200 hover:border-amber-300' : 'bg-white border-border hover:border-primary/40'}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className={`h-4 w-4 ${(pendingQuoteCount ?? 0) > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium text-muted-foreground">견적 대기</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${(pendingQuoteCount ?? 0) > 0 ? 'text-amber-700' : 'text-foreground'}`}>
              {pendingQuoteCount ?? 0}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              {(pendingQuoteCount ?? 0) > 0 ? '예약 확정이 필요해요' : '대기 중인 견적 없음'}
            </p>
          </div>
        </Link>

        <div className="bg-white rounded-xl border border-dashed border-border p-4 h-full opacity-60">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">미해결 클레임</span>
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">준비 중</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-muted-foreground">—</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">클레임 관리 기능 개발 예정</p>
        </div>
      </div>

      {/* 운영 현황 — 2컬럼 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* 주간 매출 추이 */}
        <div className="bg-white rounded-xl border border-border p-5">
          <WeeklyChart data={weeklyData} maxRevenue={maxWeeklyRevenue} total={weeklyTotal} />
        </div>

        {/* 예약 파이프라인 + 고객 현황 */}
        <div className="bg-white rounded-xl border border-border p-5 space-y-4">
          {/* 파이프라인 */}
          <div>
            <p className="text-sm font-semibold mb-3">예약 파이프라인</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-xs text-muted-foreground">예약 확정</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 rounded-full bg-primary/20 overflow-hidden" style={{ width: '80px' }}>
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min((confirmedCount / Math.max(confirmedCount + inProgressCount, 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums w-8 text-right">{confirmedCount}건</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs text-muted-foreground">진행 중</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden" style={{ width: '80px' }}>
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${Math.min((inProgressCount / Math.max(confirmedCount + inProgressCount, 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums w-8 text-right">{inProgressCount}건</span>
                </div>
              </div>
            </div>
            {confirmedCount === 0 && inProgressCount === 0 && (
              <p className="text-xs text-muted-foreground/60 mt-2">진행 중인 예약이 없어요</p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* B2B 거래처 현황 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">거래처 현황</p>
              <Link href="/dashboard/pipeline" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5">
                관리 <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Link href="/dashboard/pipeline?status=active">
                <div className="rounded-lg bg-violet-50 p-3 hover:bg-violet-100 transition-colors">
                  <div className="flex items-center gap-1 mb-1">
                    <Handshake className="h-3 w-3 text-violet-500" />
                    <span className="text-[10px] text-violet-600">상담 중</span>
                  </div>
                  <p className="text-lg font-bold text-violet-700 tabular-nums">{activeLeads.length}곳</p>
                </div>
              </Link>
              <Link href="/dashboard/pipeline?status=contracted">
                <div className="rounded-lg bg-green-50 p-3 hover:bg-green-100 transition-colors">
                  <div className="flex items-center gap-1 mb-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <span className="text-[10px] text-green-600">계약</span>
                  </div>
                  <p className="text-lg font-bold text-green-700 tabular-nums">{contractedLeads.length}곳</p>
                </div>
              </Link>
              <div className="rounded-lg bg-teal-50 p-3">
                <div className="flex items-center gap-1 mb-1">
                  <RefreshCw className="h-3 w-3 text-teal-500" />
                  <span className="text-[10px] text-teal-600">월 예상</span>
                </div>
                <p className="text-sm font-bold text-teal-700 tabular-nums leading-tight">
                  {pipelineMonthlyRevenue > 0
                    ? `${Math.round(pipelineMonthlyRevenue / 10000)}만`
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* 개인 고객 현황 */}
          <div>
            <p className="text-sm font-semibold mb-3">개인 고객</p>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/dashboard/clients">
                <div className="rounded-lg bg-muted/50 p-3 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">전체 고객</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums">{totalCustomers ?? 0}명</p>
                </div>
              </Link>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">{monthLabel} 신규</span>
                </div>
                <p className="text-xl font-bold tabular-nums text-primary">{newCustomersThisMonth ?? 0}명</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 오늘 예약 */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">오늘 예약</h2>
            {todayBookings && todayBookings.length > 0 && (
              <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {todayBookings.length}건
              </span>
            )}
          </div>
          <Link
            href="/dashboard/schedule"
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
          >
            전체 보기 <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {todayBookings && todayBookings.length > 0 ? (
          <div className="divide-y divide-border">
            {todayBookings.map((booking) => {
              const status = STATUS_LABEL[booking.status] ?? { text: booking.status, className: 'bg-gray-100 text-gray-600' }
              const scheduledTime = booking.scheduled_at
                ? new Date(booking.scheduled_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                : '—'
              return (
                <div key={booking.id} className="flex items-center px-5 py-3.5 hover:bg-muted/20 transition-colors">
                  <p className="text-sm font-bold text-primary tabular-nums w-12 shrink-0">{scheduledTime}</p>
                  <div className="flex-1 min-w-0 mx-3">
                    <p className="font-medium text-sm truncate">{booking.customer_name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-semibold tabular-nums hidden sm:block">
                      {booking.final_price ? `${booking.final_price.toLocaleString('ko-KR')}원` : '—'}
                    </p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                      {status.text}
                    </span>
                    {booking.customer_phone && (
                      <a
                        href={`tel:${booking.customer_phone}`}
                        className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                      >
                        <Phone className="h-3.5 w-3.5 text-primary" />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-5 py-10 text-center space-y-1">
            <p className="text-sm font-medium text-muted-foreground">오늘은 예약이 없어요</p>
            <p className="text-xs text-muted-foreground/70">여유로운 하루예요 — 새 고객을 모아보세요</p>
          </div>
        )}
      </div>

      {/* 오늘 연락 예정 거래처 */}
      {todayFollowUpCount > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-violet-500" />
              <h2 className="font-semibold text-sm">오늘 연락 예정 거래처</h2>
              <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                {todayFollowUpCount}곳
              </span>
            </div>
            <Link
              href="/dashboard/pipeline"
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
            >
              전체 보기 <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {(todayFollowUps ?? []).map((lead) => {
              const stage = {
                new: '새 문의', contacted: '연락함', follow_up: '현장 방문',
                quoted: '견적 보냄', negotiating: '금액 협의',
              }[lead.status] ?? lead.status
              return (
                <Link key={lead.id} href={`/dashboard/pipeline/${lead.id}`}>
                  <div className="flex items-center px-5 py-3.5 hover:bg-muted/20 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{lead.company_name}</p>
                      {lead.contact_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">담당 {lead.contact_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-xs text-muted-foreground">{stage}</span>
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center hover:bg-violet-200 transition-colors"
                        >
                          <Phone className="h-3.5 w-3.5 text-violet-600" />
                        </a>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* 이번 주 예정 */}
      {upcomingBookings && upcomingBookings.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">이번 주 예정</h2>
              <span className="text-xs text-muted-foreground">({upcomingBookings.length}건)</span>
            </div>
            <Link
              href="/dashboard/schedule"
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
            >
              일정에서 보기 <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {upcomingBookings.map((booking) => {
              const status = STATUS_LABEL[booking.status] ?? { text: booking.status, className: 'bg-gray-100 text-gray-600' }
              const scheduledDate = booking.scheduled_at
                ? new Date(booking.scheduled_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })
                : '—'
              const scheduledTime = booking.scheduled_at
                ? new Date(booking.scheduled_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                : '—'
              return (
                <div key={booking.id} className="flex items-center px-5 py-3.5 hover:bg-muted/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{booking.customer_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{scheduledDate} · {scheduledTime}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <p className="text-sm font-semibold tabular-nums hidden sm:block">
                      {booking.final_price ? `${booking.final_price.toLocaleString('ko-KR')}원` : '—'}
                    </p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                      {status.text}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
