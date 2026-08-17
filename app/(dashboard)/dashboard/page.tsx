import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { QuoteLinkShare } from '@/components/dashboard/quote-link-share'
import { FollowUpSnoozeButton } from '@/components/dashboard/follow-up-snooze-button'
import { CallLink } from '@/components/dashboard/call-link'
import { WeeklyChart } from '@/components/dashboard/weekly-chart'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { BetaWelcomeBanner } from '@/components/dashboard/beta-welcome-banner'
import { QualioImpactCard } from '@/components/dashboard/qualio-impact-card'
import { getTodayLockupData, summarizeLockup } from '@/lib/lockup/today'
import {
  AlertCircle, Calendar, ChevronRight, RefreshCw,
  Wallet, ClipboardList, Star, Phone,
  Users, UserPlus, AlertTriangle, TrendingUp, CheckCircle2,
  Handshake, PhoneCall, ShieldAlert, Film, ImageIcon, Send, FileText, Lock,
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
    { data: bookingsThisMonth },
    { data: bookingsLastMonth },
    { data: activeContracts },
    { data: todayBookings },
    { count: pendingQuoteCount },
    { data: completedBookingIds },
    { data: reportedBookings },
    { count: unreviewedCount },
    { data: last7DaysCompleted },
    { count: totalCustomers },
    { count: newCustomersThisMonth },
    { count: unassignedCount },
    { data: allLeads },
    { data: todayFollowUps },
    { count: doneReelCount },
    { count: pendingPortfolioCount },
    { count: pendingChannelCount },
    { data: fieldPriceChanges },
    { count: openClaimCount },
    { count: needsReviewCount },
    { data: contractVisitLinks },
  ] = await Promise.all([
    // 이번 달 예약 전체 — 청소일(scheduled_at) 기준, 취소·노쇼만 제외.
    // 완료분만 세면 월초·월중엔 금액이 너무 작게 보여, 이번 달에 잡힌 일감 전체를 매출로 보여준다.
    // updated_at은 담당자 배정·정기방문 생성 등 어떤 수정에도 갱신돼, 과거 건이 이번 달로 잘못 잡힘
    // contract_id로 일회성/정기 방문을 갈라야 한다 — 정기 방문은 건별 금액이 0이라
    // 섞어서 평균을 내면 객단가가 실제의 몇 분의 일로 찍힌다(아래 계산부 주석 참고)
    db.from('bookings').select('final_price, status, contract_id' as never)
      .eq('business_id', businessId)
      .not('status', 'in', '("cancelled","no_show")')
      .is('deleted_at', null)
      .gte('scheduled_at', thisMonthStart).lt('scheduled_at', nextMonthStart) as unknown as Promise<{
        data: { final_price: number | null; status: string; contract_id: string | null }[] | null
      }>,

    // 지난달 예약 전체 — 청소일 기준 (전월 대비 비교용, 같은 기준으로 맞춤)
    db.from('bookings').select('final_price, status, contract_id' as never)
      .eq('business_id', businessId)
      .not('status', 'in', '("cancelled","no_show")')
      .is('deleted_at', null)
      .gte('scheduled_at', lastMonthStart).lt('scheduled_at', thisMonthStart) as unknown as Promise<{
        data: { final_price: number | null; status: string; contract_id: string | null }[] | null
      }>,

    // 활성 정기 계약 (매출 합산 + 방문 누락 감지용 날짜 + 정기계약 거래처 수 집계용 customer_id)
    db.from('contracts').select('id, customer_id, contract_price, start_date, end_date')
      .eq('business_id', businessId).eq('status', 'active'),

    // 오늘 예약
    db.from('bookings')
      .select('id, customer_name, customer_phone, scheduled_at, selected_tier, final_price, status')
      .eq('business_id', businessId).is('deleted_at', null)
      .gte('scheduled_at', todayStartUTC.toISOString())
      .lt('scheduled_at', todayEndUTC.toISOString())
      .not('status', 'in', '("cancelled","completed")')
      .order('scheduled_at', { ascending: true }),

    // 미답변 견적 수 — 테스트 견적(대표 본인 번호로 넣어본 것)은 제외.
    // 목록을 보여주는 고객 관리(clients/page.tsx)가 is_test를 걸러내므로 여기서도 같은 기준이라야 한다.
    // 안 그러면 홈은 "확인 안 된 견적 1건"이라는데 눌러서 가면 아무것도 없어, 사장님이
    // 없앨 수 없는 알림을 계속 보게 된다.
    db.from('quotes').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('status', 'pending')
      .eq('is_test' as never, false as never),

    // 완료 예약 ID (보고서 체크용) — 정기계약 방문(contract_id)은 매일 보고서 불필요라 제외.
    // '안 보내고 넘김'(report_skipped_at) 처리한 건도 제외 — 알림톡 목록과 같은 기준이라야
    // 목록은 비었는데 홈 알림만 남는 일이 없다.
    db.from('bookings').select('id')
      .eq('business_id', businessId).eq('status', 'completed').is('deleted_at', null)
      .is('contract_id' as never, null)
      .is('report_skipped_at' as never, null),

    // 보고서 발송 목록
    db.from('reports').select('booking_id').eq('business_id', businessId),

    // 리뷰 미요청 수 — 작업이 '완료' 처리된 예약만 센다.
    // 예약 상태를 안 보면 아직 하지도 않은 내일 일정에까지 "후기 요청" 할 일이 뜬다.
    // 청소를 받지도 않은 고객에게 후기를 부탁하는 건 신뢰를 깎는 일이라 목록·버튼·이 카운트가
    // 모두 같은 기준(완료된 예약)이어야 한다.
    db.from('reports').select('id, bookings!booking_id!inner(status)' as never, { count: 'exact', head: true })
      .eq('business_id', businessId)
      .not('kakao_sent_at', 'is', null).is('review_request_sent_at', null)
      .eq('bookings.status' as never, 'completed' as never),

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

    // 앞으로 예정된(오늘 이후) 정기계약 방문 — 계약별 방문 누락 감지용
    // (활성 계약인데 여기 안 잡히면 자동생성이 실패했거나 일정이 비어 있다는 신호)
    db.from('bookings' as never)
      .select('contract_id' as never)
      .eq('business_id' as never, businessId)
      .not('contract_id' as never, 'is', null)
      .gte('scheduled_at' as never, todayStartUTC.toISOString())
      .not('status' as never, 'in', '("cancelled","completed","no_show")')
      .is('deleted_at' as never, null) as unknown as Promise<{ data: { contract_id: string }[] | null }>,
  ])

  // ── 계산 ──────────────────────────────────────────────
  // ★건수·객단가는 '일회성'만 센다. 정기계약 방문(contract_id 있음)은 건별 금액이 0이고
  //   월 단위로 contract_price에 잡히기 때문에, 섞으면 두 지표가 다 망가진다.
  //   실제로 다트클린 8월은 29건 중 23건이 정기 방문이라, 섞어 계산한 평균 단가가
  //   34만원으로 찍혔다(일회성만 보면 166만원). 정기가 늘수록 객단가가 0에 수렴한다.
  //   정기계약은 옆의 '정기 계약 매출/월' 카드가 따로 담당한다.
  const monthBookings      = bookingsThisMonth ?? []
  const monthOneOff        = monthBookings.filter((b) => !b.contract_id)
  const monthContractVisits = monthBookings.length - monthOneOff.length
  // 정기 방문 건수까지 적으면 숫자가 두 개라 오히려 헷갈린다 — 이 카드에 안 들어간다는 사실만 알린다
  const contractAside      = monthContractVisits > 0 ? ' · 정기 계약은 별도' : ''

  // 매출은 전체를 더해도 같다(정기 방문은 final_price가 0) — 기준을 맞추려고 일회성으로 통일
  const monthRevenue       = monthOneOff.reduce((s, b) => s + (b.final_price ?? 0), 0)
  const monthBookingCount  = monthOneOff.length
  const monthCompleted     = monthOneOff.filter((b) => b.status === 'completed')
  const monthCompletedCount = monthCompleted.length
  const monthCompletedRevenue = monthCompleted.reduce((s, b) => s + (b.final_price ?? 0), 0)
  const monthRemainingCount = monthBookingCount - monthCompletedCount

  // 전월 대비 배지도 같은 기준(일회성)이라야 의미가 있다
  const lastMonthOneOff    = (bookingsLastMonth ?? []).filter((b) => !b.contract_id)
  const lastMonthRevenue   = lastMonthOneOff.reduce((s, b) => s + (b.final_price ?? 0), 0)
  const lastMonthCount     = lastMonthOneOff.length
  const avgDealSize        = monthBookingCount > 0 ? Math.round(monthRevenue / monthBookingCount) : 0
  const monthlyContractRevenue = (activeContracts ?? []).reduce((s, c) => s + (c.contract_price ?? 0), 0)

  // 방문 누락 감지: 지금 유효기간 안(시작함 & 안 끝남)인 활성 계약인데 앞으로 예정된 방문이 하나도 없는 경우.
  // 자동생성 예외·고객정보 누락·크론 누락 등 원인과 무관하게 "일정이 비어 있다"는 결과만으로 잡아낸다.
  const contractsWithUpcomingVisit = new Set(
    (contractVisitLinks ?? []).map((b) => b.contract_id),
  )
  const missingVisitContractCount = (activeContracts ?? []).filter(
    (c) =>
      c.start_date <= todayKSTStr &&
      (!c.end_date || c.end_date >= todayKSTStr) &&
      !contractsWithUpcomingVisit.has(c.id),
  ).length

  const revenueDiff    = monthRevenue - lastMonthRevenue
  const revenuePct     = lastMonthRevenue > 0 ? Math.round((revenueDiff / lastMonthRevenue) * 100) : null
  const countDiff      = monthBookingCount - lastMonthCount

  const reportedSet    = new Set((reportedBookings ?? []).map((r) => r.booking_id))
  const unreportedCount = (completedBookingIds ?? []).filter((b) => !reportedSet.has(b.id)).length


  // B2B 거래처 지표 — 거래처(company)만, 보관(archived)·거절(rejected)은 제외
  const companyLeads      = (allLeads ?? []).filter((l) => l.customer_type === 'company')
  const activeLeads       = companyLeads.filter((l) => !['contracted', 'rejected', 'archived'].includes(l.status))
  // 거래처 현황 '정기계약'은 '성사된 리드'가 아니라 실제 활성 정기계약이 있는 거래처 수로 센다.
  // (일회성으로 성사된 업체 건은 정기 매출이 아니므로 이 숫자·월 예상에 잡히지 않게 함)
  const contractCustomerCount = new Set(
    ((activeContracts ?? []) as Array<{ customer_id: string | null }>)
      .map((c) => c.customer_id)
      .filter((v): v is string => Boolean(v)),
  ).size
  // 거래처 현황 '월 예상'은 상담 단계의 추정 예산(leads.monthly_budget)이 아니라
  // 실제 체결된 정기 계약 매출(monthlyContractRevenue)을 그대로 사용해 KPI 카드와 값이 일치하도록 한다
  const todayFollowUpCount = (todayFollowUps ?? []).length
  // 아직 손 안 댄 새 문의 — 목록은 5건까지, 개수는 전체 기준으로 보여준다
  const newLeadCount = (allLeads ?? []).filter((l) => l.status === 'new').length

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

  // 오늘 문단속 현장 현황 — 사이드바에서 내린 대신 홈 카드로 노출 (문제 있을 때만 눈에 띔)
  const lockupData = await getTodayLockupData(db as unknown as SupabaseClient, businessId)
  const lockup = summarizeLockup(lockupData.visits, lockupData.durationById, Date.now())

  // 알림 배너 여부
  const hasAlerts = (pendingQuoteCount ?? 0) > 0 || unreportedCount > 0 ||
    (unreviewedCount ?? 0) > 0 || (unassignedCount ?? 0) > 0 || todayFollowUpCount > 0 ||
    (doneReelCount ?? 0) > 0 || (pendingPortfolioCount ?? 0) > 0 || (pendingChannelCount ?? 0) > 0 ||
    fieldPriceChangedCount > 0 || (openClaimCount ?? 0) > 0 || (needsReviewCount ?? 0) > 0 ||
    (pendingMonthlyReportCount ?? 0) > 0 || (pendingReengagementCount ?? 0) > 0 ||
    missingVisitContractCount > 0

  // 오늘 현장 문단속 — 미마감이 있으면 상단에 빨간 카드로 크게, 정상이면 아래에 한 줄로만.
  // 아무 문제 없는 날까지 큰 카드가 자리를 차지하면 정작 봐야 할 돈·문의 지표가 아래로 밀린다.
  const lockupStrip = lockup.total > 0 ? (
    <Link href="/dashboard/attendance">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 hover:border-primary/40 transition-colors">
        <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs text-muted-foreground">오늘 현장 문단속</span>
        <span className="text-xs font-semibold">
          {lockup.total}곳 중 <span className="text-emerald-600">{lockup.done}곳 마감</span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto shrink-0" />
      </div>
    </Link>
  ) : null

  const lockupCard = lockup.total > 0 ? (
    <Link href="/dashboard/attendance">
      <div className={`rounded-xl border p-4 hover:shadow-sm transition-all ${lockup.overdue > 0 ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-white border-border hover:border-primary/40'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lock className={`h-4 w-4 ${lockup.overdue > 0 ? 'text-red-500' : 'text-primary'}`} />
            <span className="text-sm font-semibold">오늘 현장 문단속</span>
          </div>
          <span className={`text-xs flex items-center gap-0.5 ${lockup.overdue > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
            현황 보기 <ChevronRight className="h-3 w-3" />
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">{lockup.total}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">오늘 현장</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold tabular-nums ${lockup.done > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{lockup.done}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">마감 완료</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold tabular-nums ${lockup.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{lockup.overdue}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">확인 필요</p>
          </div>
        </div>
        {lockup.overdue > 0 && (
          <p className="text-xs text-red-600 mt-3">마감이 안 된 현장이 있어요 — 눌러서 도착·마감 사진을 확인하세요</p>
        )}
      </div>
    </Link>
  ) : null

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

      {/* 베타 안내 배너 — 베타 기간·무료 사용 범위·오류 신고 방법 안내(베타 개방 기간에만·닫으면 기억) */}
      <BetaWelcomeBanner />

      {/* 앱 설치 유도 배너 — 설치 완료/닫음 시 자동으로 사라짐 */}
      <InstallPrompt />

      {/* 첫 이용 온보딩 체크리스트 — 셋업을 모두 마치면 자동으로 사라짐 */}
      <OnboardingChecklist businessId={businessId} />

      {/* ROI 성과판 — 퀄리오가 데려온 예약·만든 매출·요금 대비 몇 배 (실데이터만) */}
      <QualioImpactCard businessId={businessId} />

      {/* 액션 알림 */}
      {hasAlerts && (
        <div className="space-y-2">
          {missingVisitContractCount > 0 && (
            <Link href="/dashboard/contracts">
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 hover:bg-red-100 transition-colors">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">
                    예정된 방문이 없는 정기계약이 {missingVisitContractCount}건 있어요
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">계약은 진행 중인데 앞으로 잡힌 방문이 없어요 — 눌러서 일정을 확인해주세요</p>
                </div>
                <ChevronRight className="h-4 w-4 text-red-400 shrink-0" />
              </div>
            </Link>
          )}
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
          {/* 미해결 클레임도 '오늘 할 일' 타일에 있다 */}
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
                    홈페이지에 올릴 포트폴리오 초안 {pendingPortfolioCount}개가 있어요
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
          {/* 견적 대기도 '오늘 할 일' 타일에 있다 */}
          {/* 작업 보고서 미발송은 아래 '오늘 할 일' 타일에서 본다 — 같은 내용을 두 번 띄우지 않는다 */}
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

      {/* 오늘 현장 문단속 — 미마감(확인 필요)이 있을 때만 상단에 빨갛게 노출. 정상이면 핵심 지표 아래로 */}
      {lockup.overdue > 0 && lockupCard}

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
              <p className="text-xs font-medium text-muted-foreground mt-1">{monthLabel} 일회성 매출</p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {monthRemainingCount > 0
                  ? `완료 ${Math.round(monthCompletedRevenue / 10000).toLocaleString('ko-KR')}만원 · 남은 일정 ${monthRemainingCount}건`
                  : revenuePct !== null
                    ? `전월 대비 ${revenueDiff >= 0 ? '+' : ''}${Math.round(revenueDiff / 10000)}만원`
                    : '이번 달 잡힌 일정 전체'}
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
              <p className="text-xl font-bold tabular-nums leading-tight">{monthBookingCount}건</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">{monthLabel} 일회성 청소</p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {monthBookingCount === 0
                  ? monthContractVisits > 0
                    ? '아직 없어요 · 정기 계약은 별도'
                    : '아직 잡힌 일정이 없어요'
                  : monthRemainingCount > 0
                    ? `완료 ${monthCompletedCount}건 · 남은 ${monthRemainingCount}건${contractAside}`
                    : `모두 완료했어요${contractAside}`}
              </p>
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
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{monthLabel} 일회성 {monthBookingCount}건 기준</p>
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
        {/* 새 문의 — 손대기 전 단계라 견적 대기보다 앞에 온다(문의 → 견적 → 예약 순서) */}
        <Link href="/dashboard/clients">
          <div className={`rounded-xl border p-4 hover:shadow-sm transition-all h-full ${newLeadCount > 0 ? 'bg-primary/5 border-primary/30 hover:border-primary/50' : 'bg-white border-border hover:border-primary/40'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Send className={`h-4 w-4 ${newLeadCount > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium text-muted-foreground">새 문의</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${newLeadCount > 0 ? 'text-primary' : 'text-foreground'}`}>
              {newLeadCount}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              {newLeadCount > 0 ? '아직 연락 안 했어요' : '새로 들어온 문의 없음'}
            </p>
          </div>
        </Link>

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

        {/* 작업 보고 — 문의·견적·사고 다음에 오는 마지막 단계. 보고가 나가야 후기·재계약으로 이어진다 */}
        <Link href="/dashboard/alimtalk-todo">
          <div className={`rounded-xl border p-4 hover:shadow-sm transition-all h-full ${unreportedCount > 0 ? 'bg-orange-50 border-orange-200 hover:border-orange-300' : 'bg-white border-border hover:border-primary/40'}`}>
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList className={`h-4 w-4 ${unreportedCount > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium text-muted-foreground">작업 보고 대기</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${unreportedCount > 0 ? 'text-orange-700' : 'text-foreground'}`}>
              {unreportedCount}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              {unreportedCount > 0 ? '고객에게 보낼 보고서가 있어요' : '보낼 보고서 없음'}
            </p>
          </div>
        </Link>
      </div>

      {/* 오늘 현장 문단속(정상) — 문제가 없으면 한 줄로만. 자세한 건 근태·문단속 화면에서 */}
      {lockup.overdue === 0 && lockupStrip}

      {/* 운영 현황 — 2컬럼 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* 주간 매출 추이 */}
        <div className="bg-white rounded-xl border border-border p-5">
          <WeeklyChart data={weeklyData} maxRevenue={maxWeeklyRevenue} total={weeklyTotal} />
        </div>

        {/* 거래처 + 고객 현황 */}
        {/* '예약 파이프라인'(확정·진행 중 막대)은 뺐다(2026-08-18) — 숫자를 봐도 사장님이 오늘
            다르게 할 행동이 없어 실제로 안 보던 카드였다. 예약 현황은 일정·배정에서 본다. */}
        <div className="bg-white rounded-xl border border-border p-5 space-y-4">
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
                    <span className="text-[10px] text-green-600">정기계약</span>
                  </div>
                  <p className="text-lg font-bold text-green-700 tabular-nums">{contractCustomerCount}곳</p>
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
                      {lead.phone && <CallLink phone={lead.phone} />}
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

      {/* '이번 주 예정' 박스는 뺐다(2026-08-18) — 일정·배정 화면에 같은 내용이 더 잘 나와 있어
          홈에 또 두면 사장님이 어느 화면을 봐야 하는지 헷갈린다. 홈은 '오늘'까지만 보여준다. */}

    </div>
  )
}
