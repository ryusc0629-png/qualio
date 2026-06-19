import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { startOfWeek, endOfWeek, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, addDays, subDays, format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ScheduleBoard } from '@/components/dashboard/schedule-board'

interface PageProps {
  searchParams: Promise<{ week?: string; view?: string; date?: string }>
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const { week, view: viewParam, date: dateParam } = await searchParams
  const view = (['day', 'week', 'month'].includes(viewParam ?? '') ? viewParam! : 'week') as 'day' | 'week' | 'month'

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
  const businessId = profile.business_id

  // 뷰별 범위 계산
  const baseDate = (dateParam ?? week) ? new Date((dateParam ?? week) + 'T00:00:00') : new Date()

  let rangeStart: Date
  let rangeEnd: Date
  let prevNav: string
  let nextNav: string
  let rangeLabel: string

  if (view === 'day') {
    rangeStart = new Date(format(baseDate, 'yyyy-MM-dd') + 'T00:00:00')
    rangeEnd   = new Date(format(baseDate, 'yyyy-MM-dd') + 'T23:59:59')
    prevNav = format(subDays(rangeStart, 1), 'yyyy-MM-dd')
    nextNav = format(addDays(rangeStart, 1), 'yyyy-MM-dd')
    rangeLabel = format(rangeStart, 'M월 d일 (EEE)', { locale: ko })
  } else if (view === 'month') {
    rangeStart = startOfMonth(baseDate)
    rangeEnd   = endOfMonth(baseDate)
    prevNav = format(subMonths(rangeStart, 1), 'yyyy-MM-dd')
    nextNav = format(addMonths(rangeStart, 1), 'yyyy-MM-dd')
    rangeLabel = format(rangeStart, 'yyyy년 M월', { locale: ko })
  } else {
    // week (기본)
    rangeStart = startOfWeek(baseDate, { weekStartsOn: 1 })
    rangeEnd   = endOfWeek(baseDate, { weekStartsOn: 1 })
    prevNav = format(subWeeks(rangeStart, 1), 'yyyy-MM-dd')
    nextNav = format(addWeeks(rangeStart, 1), 'yyyy-MM-dd')
    rangeLabel = `${format(rangeStart, 'M월 d일', { locale: ko })} — ${format(rangeEnd, 'M월 d일', { locale: ko })}`
  }

  const [workersResult, bookingsResult] = await Promise.all([
    db
      .from('workers' as never)
      .select('id, name, type, color, phone')
      .eq('business_id' as never, businessId)
      .eq('is_active' as never, true)
      .order('created_at' as never),

    db
      .from('bookings' as never)
      .select('id, customer_name, customer_phone, service_address, scheduled_at, final_price, status, worker_id, quotes!quote_id(cleaning_type)')
      .eq('business_id' as never, businessId)
      .in('status' as never, ['confirmed', 'in_progress', 'completed'])
      .gte('scheduled_at' as never, rangeStart.toISOString())
      .lte('scheduled_at' as never, rangeEnd.toISOString())
      .is('deleted_at' as never, null)
      .order('scheduled_at' as never),
  ])

  // 예약별 배정된 팀원 목록 조회
  const bookingIds = ((bookingsResult as unknown as { data: { id: string }[] | null }).data ?? []).map(b => b.id)
  type BookingWorkerRow = { booking_id: string; worker_id: string; is_lead: boolean }
  const bookingWorkersMap = new Map<string, string[]>()

  if (bookingIds.length > 0) {
    const { data: bwRows } = await db
      .from('booking_workers' as never)
      .select('booking_id, worker_id, is_lead')
      .in('booking_id' as never, bookingIds)
      .order('is_lead' as never, { ascending: false }) as unknown as { data: BookingWorkerRow[] | null }

    for (const row of bwRows ?? []) {
      const existing = bookingWorkersMap.get(row.booking_id) ?? []
      bookingWorkersMap.set(row.booking_id, [...existing, row.worker_id])
    }
  }

  const workers = (workersResult.data ?? []) as Array<{
    id: string; name: string; type: string; color: string; phone: string | null
  }>

  type RawBooking = {
    id: string; customer_name: string; customer_phone: string | null
    service_address: string | null; scheduled_at: string; final_price: number
    status: string; worker_id: string | null
    quotes: { cleaning_type: string | null } | null
  }
  const bookings = ((bookingsResult as unknown as { data: RawBooking[] | null }).data) ?? []

  // 전화번호 → 고객 ID 매핑 (고객 상세 링크용)
  const phones = [...new Set(bookings.map(b => b.customer_phone).filter(Boolean))] as string[]
  const customerMap = new Map<string, string>()
  if (phones.length > 0) {
    const { data: customers } = await db
      .from('customers')
      .select('id, phone')
      .eq('business_id', businessId)
      .in('phone', phones)
    for (const c of customers ?? []) {
      if (c.phone) customerMap.set(c.phone, c.id)
    }
  }

  // 완료된 예약의 보고서 상태 조회 (알림톡 발송 여부 표시용)
  const completedIds = bookings.filter(b => b.status === 'completed').map(b => b.id)
  type ReportRow = { id: string; booking_id: string; review_request_sent_at: string | null }
  const reportMap = new Map<string, { id: string; reviewSent: boolean }>()

  if (completedIds.length > 0) {
    const { data: reportRows } = await db
      .from('reports' as never)
      .select('id, booking_id, review_request_sent_at' as never)
      .in('booking_id' as never, completedIds) as unknown as { data: ReportRow[] | null }

    for (const r of reportRows ?? []) {
      reportMap.set(r.booking_id, { id: r.id, reviewSent: !!r.review_request_sent_at })
    }
  }

  // 리뷰 작성 이력이 있는 고객 전화번호 조회
  const reviewedPhones = new Set<string>()
  if (phones.length > 0) {
    const { data: claimedRows } = await db
      .from('review_claims' as never)
      .select('customer_phone' as never)
      .eq('business_id' as never, businessId)
      .in('customer_phone' as never, phones)
      .not('claimed_at' as never, 'is', null) as unknown as { data: { customer_phone: string }[] | null }

    for (const c of claimedRows ?? []) {
      reviewedPhones.add(c.customer_phone)
    }
  }

  // 미해결 클레임이 있는 고객 전화번호 조회 (캘린더 카드에 빨간 표시)
  const claimPhones = new Set<string>()
  if (phones.length > 0) {
    const { data: openClaimRows } = await db
      .from('claims' as never)
      .select('customer_phone' as never)
      .eq('business_id' as never, businessId)
      .neq('status' as never, 'resolved')
      .in('customer_phone' as never, phones) as unknown as { data: { customer_phone: string | null }[] | null }

    for (const c of openClaimRows ?? []) {
      if (c.customer_phone) claimPhones.add(c.customer_phone)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">일정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          예약을 드래그해서 날짜와 담당자를 변경하세요
        </p>
      </div>

      <ScheduleBoard
        businessId={businessId}
        workers={workers ?? []}
        bookings={bookings.map((b) => ({
          id:              b.id,
          customer_name:   b.customer_name,
          customer_phone:  b.customer_phone,
          service_address: b.service_address,
          scheduled_at:    b.scheduled_at,
          final_price:     b.final_price,
          status:          b.status,
          worker_id:       b.worker_id,
          workerIds:       bookingWorkersMap.get(b.id) ?? (b.worker_id ? [b.worker_id] : []),
          cleaning_type:   b.quotes?.cleaning_type ?? null,
          customer_id:     b.customer_phone ? customerMap.get(b.customer_phone) ?? null : null,
          reportId:        reportMap.get(b.id)?.id ?? null,
          reviewSent:      reportMap.get(b.id)?.reviewSent ?? false,
          hasReviewHistory: b.customer_phone ? reviewedPhones.has(b.customer_phone) : false,
          hasOpenClaim:     b.customer_phone ? claimPhones.has(b.customer_phone) : false,
        }))}
        weekStart={rangeStart.toISOString()}
        weekLabel={rangeLabel}
        prevNav={prevNav}
        nextNav={nextNav}
        view={view}
      />
    </div>
  )
}
