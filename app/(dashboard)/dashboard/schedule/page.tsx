import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { startOfWeek, endOfWeek, addWeeks, subWeeks, format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ScheduleBoard } from '@/components/dashboard/schedule-board'

interface PageProps {
  searchParams: Promise<{ week?: string }>
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const { week } = await searchParams

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

  // 주간 범위 계산
  const baseDate = week ? new Date(week + 'T00:00:00') : new Date()
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 }) // 월요일 시작
  const weekEnd   = endOfWeek(baseDate, { weekStartsOn: 1 })

  const prevWeek = format(subWeeks(weekStart, 1), 'yyyy-MM-dd')
  const nextWeek = format(addWeeks(weekStart, 1), 'yyyy-MM-dd')
  const weekLabel = `${format(weekStart, 'M월 d일', { locale: ko })} — ${format(weekEnd, 'M월 d일', { locale: ko })}`

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
      .gte('scheduled_at' as never, weekStart.toISOString())
      .lte('scheduled_at' as never, weekEnd.toISOString())
      .is('deleted_at' as never, null)
      .order('scheduled_at' as never),
  ])

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
          cleaning_type:   b.quotes?.cleaning_type ?? null,
          customer_id:     b.customer_phone ? customerMap.get(b.customer_phone) ?? null : null,
          reportId:        reportMap.get(b.id)?.id ?? null,
          reviewSent:      reportMap.get(b.id)?.reviewSent ?? false,
        }))}
        weekStart={weekStart.toISOString()}
        weekLabel={weekLabel}
        prevWeek={prevWeek}
        nextWeek={nextWeek}
      />
    </div>
  )
}
