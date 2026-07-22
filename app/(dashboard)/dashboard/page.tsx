import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { QuoteLinkShare } from '@/components/dashboard/quote-link-share'
import { FollowUpSnoozeButton } from '@/components/dashboard/follow-up-snooze-button'
import { WeeklyChart } from '@/components/dashboard/weekly-chart'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import {
  AlertCircle, Calendar, ChevronRight, RefreshCw,
  Wallet, ClipboardList, Star, Phone,
  Users, UserPlus, AlertTriangle, TrendingUp, CheckCircle2,
  Handshake, PhoneCall, ShieldAlert, Film, ImageIcon, Send, FileText,
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
    .select('business_id, businesses!business_id(name, slug)')
    .eq('id', user.id)
    .maybeSingle()

  const businessId = profile?.business_id
  if (!businessId) redirect('/onboarding')

  const businessInfo = profile?.businesses as { name: string; slug: string | null } | null
  const businessName = businessInfo?.name ?? '내 업체'
  const now = new Date()

  // 날짜 범위 계산 (KST 기준)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayKSTStr = nowKST.toISOString().slice(0, 10)
  const todayKSTStart = new Date(nowKST)
  todayKSTStart.setUTCHours(0, 0, 0, 0)
  const todayStartUTC = new Date(todayKSTStart.getTime() - 9 * 60 * 60 * 1000)
  const todayEndUTC   = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000)
  const weekEndUTC    = new Date(todayStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000)

  // 월 경계는 KST 기준으로 계산 — Vercel은 UTC라 로컬 생성자(new Date(y,m,1))를 쓰면 경계가 9시간 밀림
  const KST_OFFSET     = 9 * 60 * 60 * 1000
  const kstYear        = nowKST.getUTCFullYear()
  const kstMonth       = nowKST.getUTCMonth()
  const thisMonthStart = new Date(Date.UTC(kstYear, kstMonth, 1) - KST_OFFSET).toISOString()
  const nextMonthStart = new Date(Date.UTC(kstYear, kstMonth + 1, 1) - KST_OFFSET).toISOString()
  const lastMonthStart = new Date(Date.UTC(kstYear, kstMonth - 1, 1) - KST_OFFSET).toISOString()
  const sevenDaysAgo   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthLabel     = `${kstMonth + 1}월`

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
    { count: doneReelCount },
    { count: pendingPortfolioCount },
    { count: pendingChannelCount },
    { data: fieldPriceChanges },
    { count: openClaimCount },
    { count: needsReviewCount },
  ] = await Promise.all([
    // 이번 달 완료 예약 — 청소일(scheduled_at) 기준.
    // updated_at은 담당자 배정·정기방문 생성 등 어떤 수정에도 갱신돼, 과거 완료 건이 이번 달로 잘못 잡힘
    db.from('bookings').select('final_price')
      .eq('business_id', businessId).eq('status', 'completed')
      .is('deleted_at', null)
      .gte('scheduled_at', thisMonthStart).lt('scheduled_at', nextMonthStart),

    // 지난달 완료 예약 — 청소일 기준
    db.from('bookings').select('final_price')
      .eq('business_id', businessId).eq('status', 'completed')
      .is('deleted_at', null)
      .gte('scheduled_at', lastMonthStart).lt('scheduled_at', thisMonthStart),

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

    // 거래처 파이프라인 전체 (거래처 현황 카운트용 — customer_type로 거래처/개인 구분)
    db.from('leads')
      .select('id, status, customer_type')
      .eq('business_id', businessId),

    // 연락할 거래처 — 오늘 예정 + 지난 일정(놓친 연락)까지 포함
    db.from('leads')
      .select('id, company_name, phone, contact_name, status, next_follow_up_date')
      .eq('business_id', businessId)
      .lte('next_follow_up_date', todayKSTStr)
      .not('status', 'in', '("contracted","rejected")')
      .order('next_follow_up_date', { ascending: true }),

    // 완성된 릴스 (다운로드 대기)
    db.from('reports' as never).select('id', { count: 'exact', head: true })
      .eq('business_id' as never, businessId)
      .eq('reel_status' as never, 'done'),

    // 미발행 포트폴리오 초안
    db.from('biz_posts' as never).select('id', { count: 'exact', head: true })
      .eq('business_id' as never, businessId)
      .eq('post_type' as never, 'portfolio')
      .eq('published' as never, false),

    // 아직 채널에 안 올린 글 (네이버/당근/인스타 콘텐츠 있고 완료 처리 안 됨)
    db.from('biz_posts' as never).select('id', { count: 'exact', head: true })
      .eq('business_id' as never, businessId)
      .eq('published' as never, true)
      .neq('post_type' as never, 'portfolio')
      .is('channel_posted_at' as never, null)
      .or('naver_content.not.is.null,daangn_content.not.is.null,instagram_content.not.is.null' as never),

    // 오늘 현장에서 금액을 조정한 변경 이력 (직원이 항목 가감)
    db.from('booking_price_changes' as never)
      .select('booking_id' as never)
      .eq('business_id' as never, businessId)
      .eq('changed_by' as never, 'worker')
      .gte('created_at' as never, todayStartUTC.toISOString()) as unknown as Promise<{ data: { booking_id: string }[] | null }>,

    // 미해결 클레임 수
    db.from('claims' as never)
      .select('id' as never, { count: 'exact', head: true })
      .eq('business_id' as never, businessId)
      .neq('status' as never, 'resolved') as unknown as Promise<{ count: number | null }>,

    // 금액 확인이 필요한 예약 수 (변동형 항목 포함, 아직 완료·취소 전)
    db.from('bookings' as never)
      .select('id' as never, { count: 'exact', head: true })
      .eq('business_id' as never, businessId)
      .eq('needs_review' as never, true)
      .not('status' as never, 'in', '("completed","cancelled","no_show")')
      .is('deleted_at' as never, null) as unknown as Promise<{ count: number | null }>,
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

  // B2B 거래처 지표 — 거래처(company)만, 보관(archived)·거절(rejected)은 제외
  const companyLeads      = (allLeads ?? []).filter((l) => l.customer_type === 'company')
  const activeLeads       = companyLeads.filter((l) => !['contracted', 'rejected', 'archived'].includes(l.status))
  const contractedLeads   = companyLeads.filter((l) => l.status === 'contracted')
  // 거래처 현황 '월 예상'은 상담 단계의 추정 예산(leads.monthly_budget)이 아니라
  // 실제 체결된 정기 계약 매출(monthlyContractRevenue)을 그대로 사용해 KPI 카드와 값이 일치하도록 한다
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
  // 읽기 좋은 주소(slug)가 있으면 그걸로, 없으면 옛 UUID로 — 둘 다 /q 라우트가 받음
  const quoteUrl = `${baseUrl}/q/${businessInfo?.slug ?? businessId}`

  const dateLabel = now.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  // 오늘 현장에서 금액이 조정된 예약 수 (직원 변경, 중복 제거)
  const fieldPriceChangedCount = new Set((fieldPriceChanges ?? []).map((c) => c.booking_id)).size

  // 검토 대기 중인 거래처 월간 리포트 수 (매월 초 자동 준비됨)
  // monthly_report_dispatches는 아직 database.ts 타입에 없어 느슨한 클라이언트로 접근
  const { count: pendingMonthlyReportCount } = await (db as unknown as SupabaseClient)
    .from('monthly_report_dispatches')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'pending')

  // 검토 대기 중인 재방문 유도 건 (마지막 방문 90일 경과 단골 대상, 개인화 문구 준비됨)
  const { count: pendingReengagementCount } = await (db as unknown as SupabaseClient)
    .from('reengagement_dispatches')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'pending')

  // 알림 배너 여부
  const hasAlerts = (pendingQuoteCount ?? 0) > 0 || unreportedCount > 0 ||
    (unreviewedCount ?? 0) > 0 || (unassignedCount ?? 0) > 0 || todayFollowUpCount > 0 ||
    (doneReelCount ?? 0) > 0 || (pendingPortfolioCount ?? 0) > 0 || (pendingChannelCount ?? 0) > 0 ||
    fieldPriceChangedCount > 0 || (openClaimCount ?? 0) > 0 || (needsReviewCount ?? 0) > 0 ||
    (pendingMonthlyReportCount ?? 0) > 0 || (pendingReengagementCount ?? 0) > 0

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

      {/* 앱 설치 유도 배너 — 설치 완료/닫음 시 자동으로 사라짐 */}
      <InstallPrompt />

      {/* 첫 이용 온보딩 체크리스트 — 셋업을 모두 마치면 자동으로 사라짐 */}
      <OnboardingChecklist businessId={businessId} />

      {/* 액션 알림 */}
      {hasAlerts && (
        <div className="space-y-2">
          {(pendingMonthlyReportCount ?? 0) > 0 && (
            <Link href="/dashboard/monthly-reports">
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 hover:bg-emerald-100 transition-colors">
                <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-emerald-800">
                    보낼 거래처 리포트가 {pendingMonthlyReportCount}건 있어요
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">지난달 작업 내역을 거래처 담당자에게 보내 관계를 이어가세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-emerald-400 shrink-0" />
              </div>
            </Link>
          )}
          {(pendingReengagementCount ?? 0) > 0 && (
            <Link href="/dashboard/reengagement">
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 hover:bg-emerald-100 transition-colors">
                <Users className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-emerald-800">
                    재방문 유도할 단골이 {pendingReengagementCount}명 있어요
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">한동안 안 오신 고객께 개인화 메시지를 보내 재구매로 이어가세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-emerald-400 shrink-0" />
              </div>
            </Link>
          )}
          {(openClaimCount ?? 0) > 0 && (
            <Link href="/dashboard/claims">
              <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 hover:bg-rose-100 transition-colors">
                <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-rose-800">
                    미해결 클레임이 {openClaimCount}건 있어요
                  </p>
                  <p className="text-xs text-rose-600 mt-0.5">고객 불만이 쌓이기 전에 눌러서 해결하세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-rose-400 shrink-0" />
              </div>
            </Link>
          )}
          {(needsReviewCount ?? 0) > 0 && (
            <Link href="/dashboard/schedule">
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors">
                <PhoneCall className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">
                    금액 확인이 필요한 예약이 {needsReviewCount}건 있어요
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">에어컨 대수·줄눈 개수처럼 수량에 따라 금액이 달라져요. 통화로 확인 후 금액을 맞춰주세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-400 shrink-0" />
              </div>
            </Link>
          )}
          {fieldPriceChangedCount > 0 && (
            <Link href="/dashboard/schedule">
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 hover:bg-indigo-100 transition-colors">
                <Wallet className="h-4 w-4 text-indigo-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-indigo-800">
                    현장에서 금액을 조정한 예약이 {fieldPriceChangedCount}건 있어요
                  </p>
                  <p className="text-xs text-indigo-600 mt-0.5">예약을 열어 누가·무엇을 바꿨는지 확인하세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-indigo-400 shrink-0" />
              </div>
            </Link>
          )}
          {(doneReelCount ?? 0) > 0 && (
            <Link href="/dashboard/marketing">
              <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 hover:bg-rose-100 transition-colors">
                <Film className="h-4 w-4 text-rose-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-rose-800">
                    완성된 릴스 {doneReelCount}개가 기다리고 있어요
                  </p>
                  <p className="text-xs text-rose-600 mt-0.5">마케팅에서 다운로드하고 SNS에 올려보세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-rose-400 shrink-0" />
              </div>
            </Link>
          )}
          {(pendingPortfolioCount ?? 0) > 0 && (
            <Link href="/dashboard/marketing">
              <div className="flex items-center gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 hover:bg-sky-100 transition-colors">
                <ImageIcon className="h-4 w-4 text-sky-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-sky-800">
                    웹사이트에 올릴 포트폴리오 초안 {pendingPortfolioCount}개가 있어요
                  </p>
                  <p className="text-xs text-sky-600 mt-0.5">마케팅에서 확인하고 발행해보세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-sky-400 shrink-0" />
              </div>
            </Link>
          )}
          {(pendingChannelCount ?? 0) > 0 && (
            <Link href="/dashboard/marketing">
              <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 hover:bg-teal-100 transition-colors">
                <Send className="h-4 w-4 text-teal-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-teal-800">
                    채널에 올릴 글이 {pendingChannelCount}개 있어요
                  </p>
                  <p className="text-xs text-teal-600 mt-0.5">네이버·당근·인스타에 올리고 “올렸어요”를 눌러주세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-teal-400 shrink-0" />
              </div>
            </Link>
          )}
          {todayFollowUpCount > 0 && (
            <Link href="/dashboard/clients?type=company">
              <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 hover:bg-violet-100 transition-colors">
                <PhoneCall className="h-4 w-4 text-violet-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-violet-800">연락할 거래처가 {todayFollowUpCount}곳 있어요</p>
                  <p className="text-xs text-violet-600 mt-0.5">오늘 예정이거나 지난 일정이에요 — 눌러서 확인하세요</p>
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

        <Link href="/dashboard/claims" className="block">
          <div className="bg-white rounded-xl border border-border p-4 h-full hover:border-rose-300 hover:shadow-sm transition-all">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className={`h-4 w-4 ${(openClaimCount ?? 0) > 0 ? 'text-rose-500' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium text-muted-foreground">미해결 클레임</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${(openClaimCount ?? 0) > 0 ? 'text-rose-600' : 'text-foreground'}`}>
              {openClaimCount ?? 0}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              {(openClaimCount ?? 0) > 0 ? '눌러서 해결하세요' : '눌러서 기록·이력 보기'}
            </p>
          </div>
        </Link>
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
              <Link href="/dashboard/clients?type=company" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5">
                관리 <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Link href="/dashboard/clients?type=company">
                <div className="rounded-lg bg-violet-50 p-3 hover:bg-violet-100 transition-colors">
                  <div className="flex items-center gap-1 mb-1">
                    <Handshake className="h-3 w-3 text-violet-500" />
                    <span className="text-[10px] text-violet-600">상담 중</span>
                  </div>
                  <p className="text-lg font-bold text-violet-700 tabular-nums">{activeLeads.length}곳</p>
                </div>
              </Link>
              <Link href="/dashboard/clients?type=company">
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
                  {monthlyContractRevenue > 0
                    ? `${Math.round(monthlyContractRevenue / 10000)}만`
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
                ? new Date(booking.scheduled_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
                : '—'
              return (
                <div key={booking.id} className="flex items-center px-5 py-3.5 hover:bg-muted/20 transition-colors">
                  <p className="text-sm font-bold text-primary tabular-nums w-16 shrink-0">{scheduledTime}</p>
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
              <h2 className="font-semibold text-sm">연락할 거래처</h2>
              <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                {todayFollowUpCount}곳
              </span>
            </div>
            <Link
              href="/dashboard/clients?type=company"
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
              // 예정일이 오늘보다 지났으면 '지남' 표시 (며칠 지났는지)
              const overdueDays = lead.next_follow_up_date && lead.next_follow_up_date < todayKSTStr
                ? Math.round((new Date(todayKSTStr).getTime() - new Date(lead.next_follow_up_date).getTime()) / 86400000)
                : 0
              return (
                <Link key={lead.id} href={`/dashboard/pipeline/${lead.id}`}>
                  <div className="flex items-center px-5 py-3.5 hover:bg-muted/20 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm truncate">{lead.company_name}</p>
                        {overdueDays > 0 && (
                          <span className="shrink-0 text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                            {overdueDays}일 지남
                          </span>
                        )}
                      </div>
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
                      <FollowUpSnoozeButton leadId={lead.id} />
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
                ? new Date(booking.scheduled_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })
                : '—'
              const scheduledTime = booking.scheduled_at
                ? new Date(booking.scheduled_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
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
