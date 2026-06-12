import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CopyLinkButton } from '@/components/dashboard/copy-link-button'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, Sparkles, TrendingUp, Wallet } from 'lucide-react'

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  confirmed:   { text: '확정',    className: 'bg-primary/10 text-primary' },
  in_progress: { text: '진행 중', className: 'bg-amber-100 text-amber-800' },
  completed:   { text: '완료',    className: 'bg-green-100 text-green-800' },
  cancelled:   { text: '취소',    className: 'bg-gray-100 text-gray-500' },
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
    .select('business_id, businesses!business_id(name)')
    .eq('id', user.id)
    .maybeSingle()

  const businessId = profile?.business_id
  if (!businessId) redirect('/onboarding')

  const businessName = (profile?.businesses as { name: string } | null)?.name ?? '내 업체'

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthLabel = `${now.getMonth() + 1}월`

  const hour = now.getHours()
  const greeting = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '안녕하세요' : '수고하셨어요'

  const [
    { data: completedThisMonth },
    { data: qualioInquiries },
    { data: qualioBookings },
    { data: recentBookings },
  ] = await Promise.all([
    // 이번 달 완료 예약 (매출 계산용)
    db.from('bookings')
      .select('final_price')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .gte('updated_at', thisMonthStart),

    // 퀄리오 유입 문의 — 이번 달 생성된 견적 수
    db.from('quotes')
      .select('id')
      .eq('business_id', businessId)
      .gte('created_at', thisMonthStart),

    // 퀄리오 유입 매출 — quote_id 있는 완료 예약의 금액 합산
    db.from('bookings')
      .select('final_price')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .not('quote_id', 'is', null)
      .is('deleted_at', null)
      .gte('updated_at', thisMonthStart),

    // 최근 예약 5건
    db.from('bookings')
      .select('id, customer_name, scheduled_at, selected_tier, final_price, status')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // 통계 계산
  const monthRevenue = (completedThisMonth ?? [])
    .reduce((sum, b) => sum + (b.final_price ?? 0), 0)

  const monthCompletedCount = completedThisMonth?.length ?? 0

  const qualioInquiryCount = qualioInquiries?.length ?? 0

  const qualioRevenue = (qualioBookings ?? [])
    .reduce((sum, b) => sum + (b.final_price ?? 0), 0)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const quoteUrl = `${baseUrl}/q/${businessId}`

  const stats = [
    {
      label: `${monthLabel} 매출`,
      value: monthRevenue > 0 ? `${monthRevenue.toLocaleString('ko-KR')}원` : '—',
      sub: '완료된 예약 기준',
      icon: Wallet,
      color: 'text-primary',
      bg: 'bg-primary/10',
      href: '/dashboard/bookings',
    },
    {
      label: `${monthLabel} 완료`,
      value: `${monthCompletedCount}건`,
      sub: '청소 완료한 건수',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      href: '/dashboard/bookings',
    },
    {
      label: '퀄리오 유입 문의',
      value: `${qualioInquiryCount}건`,
      sub: '이번 달 링크로 들어온 고객',
      icon: Sparkles,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      href: '/dashboard/quotes',
      badge: true,
    },
    {
      label: '퀄리오 유입 매출',
      value: qualioRevenue > 0 ? `${qualioRevenue.toLocaleString('ko-KR')}원` : '—',
      sub: '퀄리오가 만들어준 매출',
      icon: TrendingUp,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      href: '/dashboard/bookings',
      badge: true,
    },
  ]

  const dateLabel = now.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* 인사말 */}
      <div>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <h1 className="text-2xl font-bold mt-1">
          {greeting}, {businessName}
        </h1>
      </div>

      {/* 이달 현황 */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{monthLabel} 현황</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((stat) => {
            const card = (
              <div className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-9 h-9 ${stat.bg} rounded-xl flex items-center justify-center`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  {stat.badge && (
                    <span className="text-[10px] font-semibold bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded-full">
                      퀄리오
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-1">{stat.label}</p>
                {stat.sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{stat.sub}</p>}
              </div>
            )
            return (
              <Link key={stat.label} href={stat.href}>{card}</Link>
            )
          })}
        </div>
      </div>

      {/* 최근 예약 */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">최근 예약</h2>
          <Link
            href="/dashboard/bookings"
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
          >
            전체 보기 <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {recentBookings && recentBookings.length > 0 ? (
          <div className="divide-y divide-border">
            {recentBookings.map((booking) => {
              const status = STATUS_LABEL[booking.status] ?? { text: booking.status, className: 'bg-gray-100 text-gray-600' }
              const scheduledDate = booking.scheduled_at
                ? new Date(booking.scheduled_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                : '—'
              return (
                <div key={booking.id} className="flex items-center px-5 py-3.5 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{booking.customer_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {scheduledDate} · {TIER_LABEL[booking.selected_tier ?? ''] ?? '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
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
        ) : (
          <div className="px-5 py-12 text-center space-y-2">
            <p className="text-sm text-muted-foreground">아직 예약이 없어요</p>
            <p className="text-xs text-muted-foreground">아래 링크를 고객에게 공유해 첫 예약을 받아보세요</p>
          </div>
        )}
      </div>

      {/* 고객 견적 링크 */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-sm">고객 견적 요청 링크</h2>
          <p className="text-xs text-muted-foreground mt-1">
            카카오톡이나 문자로 공유하면 고객이 직접 견적을 요청할 수 있어요
          </p>
        </div>
        <CopyLinkButton url={quoteUrl} />
      </div>

    </div>
  )
}
