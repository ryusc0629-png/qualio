import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CopyLinkButton } from '@/components/dashboard/copy-link-button'
import Link from 'next/link'
import { CalendarCheck, TrendingUp, FileText, CheckCircle2 } from 'lucide-react'

// 예약 상태 레이블
const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  confirmed:   { text: '확정',    className: 'bg-blue-100 text-blue-800' },
  in_progress: { text: '진행 중', className: 'bg-yellow-100 text-yellow-800' },
  completed:   { text: '완료',    className: 'bg-green-100 text-green-800' },
  cancelled:   { text: '취소',    className: 'bg-gray-100 text-gray-600' },
  no_show:     { text: '노쇼',    className: 'bg-red-100 text-red-700' },
}

const TIER_LABEL: Record<string, string> = {
  good: '기본', better: '추천', best: '프리미엄',
}

export default async function DashboardPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  const businessId = profile?.business_id
  if (!businessId) redirect('/onboarding')

  // 이번 달 시작일
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthLabel = `${now.getMonth() + 1}월`

  // 5개 쿼리 병렬 실행
  const [
    { data: monthBookings },
    { count: pendingQuoteCount },
    { count: totalCompletedCount },
    { data: recentBookings },
    { data: activeContracts },
  ] = await Promise.all([
    // 이번 달 예약 (취소/노쇼 제외)
    db.from('bookings')
      .select('final_price, status')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .not('status', 'in', '("cancelled","no_show")')
      .gte('created_at', thisMonthStart),

    // 미처리 견적 수
    db.from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending'),

    // 누적 완료 예약 수
    db.from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .is('deleted_at', null),

    // 최근 예약 5건
    db.from('bookings')
      .select('id, customer_name, scheduled_at, selected_tier, final_price, status')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5),

    // 활성 정기계약 (확정 정기 매출 계산)
    db.from('contracts')
      .select('contract_price')
      .eq('business_id', businessId)
      .eq('status', 'active'),
  ])

  // 통계 계산
  const monthBookingCount = monthBookings?.length ?? 0
  const recurringRevenue = (activeContracts ?? [])
    .reduce((sum, c) => sum + (c.contract_price ?? 0), 0)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const quoteUrl = `${baseUrl}/q/${businessId}`

  const stats = [
    {
      label: `${monthLabel} 예약`,
      value: `${monthBookingCount}건`,
      icon: CalendarCheck,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '확정 정기 매출',
      value: recurringRevenue > 0 ? `${recurringRevenue.toLocaleString('ko-KR')}원` : '—',
      sub: '활성 계약 월 합계',
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
      href: '/dashboard/contracts',
    },
    {
      label: '미처리 견적',
      value: `${pendingQuoteCount ?? 0}건`,
      sub: '예약 대기 중',
      icon: FileText,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      href: '/dashboard/quotes',
    },
    {
      label: '누적 완료',
      value: `${totalCompletedCount ?? 0}건`,
      icon: CheckCircle2,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      href: '/dashboard/bookings',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-muted-foreground mt-1 text-sm">{now.getFullYear()}년 {monthLabel} 기준</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const card = (
            <div className="rounded-lg border bg-card p-5 space-y-3 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              {stat.sub && <p className="text-xs text-muted-foreground">{stat.sub}</p>}
            </div>
          )

          return stat.href ? (
            <Link key={stat.label} href={stat.href}>{card}</Link>
          ) : (
            <div key={stat.label}>{card}</div>
          )
        })}
      </div>

      {/* 최근 예약 */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">최근 예약</h2>
          <Link href="/dashboard/bookings" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            전체 보기 →
          </Link>
        </div>

        {recentBookings && recentBookings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">고객명</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">예약일</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">플랜</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">금액</th>
                  <th className="text-center px-5 py-3 font-medium text-muted-foreground">상태</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((booking) => {
                  const status = STATUS_LABEL[booking.status] ?? { text: booking.status, className: 'bg-gray-100 text-gray-600' }
                  const scheduledDate = booking.scheduled_at
                    ? new Date(booking.scheduled_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                    : '—'
                  return (
                    <tr key={booking.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-3 font-medium">{booking.customer_name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{scheduledDate}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {TIER_LABEL[booking.selected_tier ?? ''] ?? booking.selected_tier ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {booking.final_price ? `${booking.final_price.toLocaleString('ko-KR')}원` : '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                          {status.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">아직 예약이 없습니다.</p>
            <p className="text-xs text-muted-foreground mt-1">아래 링크를 고객에게 공유해보세요.</p>
          </div>
        )}
      </div>

      {/* 공개 견적 링크 */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-semibold">고객 견적 요청 링크</h2>
        <p className="text-sm text-muted-foreground">
          아래 링크를 고객에게 공유하면 견적을 요청할 수 있습니다.
        </p>
        <CopyLinkButton url={quoteUrl} />
      </div>
    </div>
  )
}
