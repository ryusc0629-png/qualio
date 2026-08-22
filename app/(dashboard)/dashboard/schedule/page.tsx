import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { startOfWeek, endOfWeek, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, addDays, subDays, format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toMarketYmd, marketDayRange } from '@/lib/format/datetime'
import { ScheduleBoard } from '@/components/dashboard/schedule-board'
import { AddClientForm } from '@/components/dashboard/add-client-form'
import Link from 'next/link'
import { Lock, ChevronRight } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ week?: string; view?: string; date?: string; booking?: string }>
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const { week, view: viewParam, date: dateParam, booking: bookingParam } = await searchParams
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
  //
  // 날짜 계산은 '연-월-일'만 다루고(parseYmd), DB 조회 시각으로 바꿀 때만 한국 시간대를 입힌다.
  // 이렇게 하지 않으면 서버(UTC)의 자정과 한국의 자정이 9시간 어긋나서,
  // 범위 첫날 오전 0~9시 일정이 조회에서 통째로 빠진다.
  // (실제로 8/17(월) 08:00 예약이 주 캘린더에서만 사라지고 월 캘린더엔 보이는 버그가 있었음)
  const parseYmd = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const baseYmd = (dateParam ?? week) ?? toMarketYmd()
  const baseDate = parseYmd(baseYmd)

  let startYmd: string
  let endYmd: string
  let prevNav: string
  let nextNav: string
  let rangeLabel: string

  if (view === 'day') {
    startYmd = endYmd = format(baseDate, 'yyyy-MM-dd')
    prevNav = format(subDays(baseDate, 1), 'yyyy-MM-dd')
    nextNav = format(addDays(baseDate, 1), 'yyyy-MM-dd')
    rangeLabel = format(baseDate, 'M월 d일 (EEE)', { locale: ko })
  } else if (view === 'month') {
    const first = startOfMonth(baseDate)
    startYmd = format(first, 'yyyy-MM-dd')
    endYmd   = format(endOfMonth(baseDate), 'yyyy-MM-dd')
    prevNav = format(subMonths(first, 1), 'yyyy-MM-dd')
    nextNav = format(addMonths(first, 1), 'yyyy-MM-dd')
    rangeLabel = format(first, 'yyyy년 M월', { locale: ko })
  } else {
    // week (기본) — 월요일 시작
    const first = startOfWeek(baseDate, { weekStartsOn: 1 })
    const last  = endOfWeek(baseDate, { weekStartsOn: 1 })
    startYmd = format(first, 'yyyy-MM-dd')
    endYmd   = format(last, 'yyyy-MM-dd')
    prevNav = format(subWeeks(first, 1), 'yyyy-MM-dd')
    nextNav = format(addWeeks(first, 1), 'yyyy-MM-dd')
    rangeLabel = `${format(first, 'M월 d일', { locale: ko })} — ${format(last, 'M월 d일', { locale: ko })}`
  }

  // 한국 기준 하루의 시작~끝을 UTC 시각으로 환산해 조회한다
  const { from: rangeFrom, to: rangeTo } = marketDayRange(startYmd, endYmd)

  const [workersResult, bookingsResult, servicesResult] = await Promise.all([
    db
      .from('workers' as never)
      .select('id, name, type, color, phone, contract_signed_at')
      .eq('business_id' as never, businessId)
      .eq('is_active' as never, true)
      .order('created_at' as never),

    db
      .from('bookings' as never)
      .select('id, customer_name, customer_phone, service_address, scheduled_at, final_price, status, worker_id, cancellation_reason, needs_review, review_reason, reschedule_requested_at, reschedule_requested_for, reschedule_note, contract_id, confirm_alimtalk_sent_at, reminder_sent_at, on_my_way_sent_at, receipt_sent_at, quotes!quote_id(cleaning_type)')
      .eq('business_id' as never, businessId)
      .in('status' as never, ['confirmed', 'in_progress', 'completed', 'cancelled'])
      .gte('scheduled_at' as never, rangeFrom)
      .lte('scheduled_at' as never, rangeTo)
      .is('deleted_at' as never, null)
      .order('scheduled_at' as never),

    // 신규 일정 추가 폼의 서비스 선택용 (활성 서비스 항목)
    db
      .from('service_items')
      .select('name, base_price, unit')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ])

  // 폼 서비스 선택용 — 이름+가격+단위, 이름 기준 중복 제거 (고객 추가 폼과 동일)
  type ServiceItemRow = { name: string | null; base_price: number | null; unit: string | null }
  const serviceMap = new Map<string, { base_price: number; unit: string }>()
  for (const s of ((servicesResult.data ?? []) as ServiceItemRow[])) {
    const name = (s.name ?? '').trim()
    if (name && !serviceMap.has(name)) serviceMap.set(name, { base_price: s.base_price ?? 0, unit: s.unit ?? '개' })
  }
  const services = [...serviceMap].map(([name, v]) => ({ name, base_price: v.base_price, unit: v.unit }))

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
    contract_signed_at: string | null
  }>

  type RawBooking = {
    id: string; customer_name: string; customer_phone: string | null
    service_address: string | null; scheduled_at: string; final_price: number
    status: string; worker_id: string | null; cancellation_reason: string | null
    needs_review: boolean | null; review_reason: string | null
    reschedule_requested_at: string | null; reschedule_requested_for: string | null; reschedule_note: string | null
    contract_id: string | null
    // 고객에게 나간 알림톡 발송 시각 — 예약 상세의 '고객에게 보낸 카톡'에 표시
    confirm_alimtalk_sent_at: string | null
    reminder_sent_at: string | null
    on_my_way_sent_at: string | null
    receipt_sent_at: string | null
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
  type ReportRow = {
    id: string; booking_id: string
    review_request_sent_at: string | null
    kakao_sent_at: string | null
  }
  const reportMap = new Map<string, { id: string; reviewSent: boolean; reportSentAt: string | null; reviewSentAt: string | null }>()

  if (completedIds.length > 0) {
    const { data: reportRows } = await db
      .from('reports' as never)
      .select('id, booking_id, review_request_sent_at, kakao_sent_at' as never)
      .in('booking_id' as never, completedIds) as unknown as { data: ReportRow[] | null }

    for (const r of reportRows ?? []) {
      reportMap.set(r.booking_id, {
        id: r.id,
        reviewSent: !!r.review_request_sent_at,
        reportSentAt: r.kakao_sent_at,
        reviewSentAt: r.review_request_sent_at,
      })
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">일정</h1>
          <p className="text-sm text-muted-foreground mt-1">
            예약을 드래그해서 날짜와 담당자를 변경하세요
          </p>
          {/* 문단속·출퇴근 현황 진입점 — 사이드바에서 내린 대신 여기서 상시 접근 */}
          <Link
            href="/dashboard/attendance"
            className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            오늘 현장 문단속·출퇴근 현황
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {/* 신규 일정 추가 — 고객 추가와 동일한 폼(고객+첫 작업) 재사용 */}
        <AddClientForm services={services} triggerLabel="신규 일정 추가" refreshOnSuccess />
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
          cancellation_reason: b.cancellation_reason ?? null,
          customer_id:     b.customer_phone ? customerMap.get(b.customer_phone) ?? null : null,
          reportId:        reportMap.get(b.id)?.id ?? null,
          reviewSent:      reportMap.get(b.id)?.reviewSent ?? false,
          hasReviewHistory: b.customer_phone ? reviewedPhones.has(b.customer_phone) : false,
          hasOpenClaim:     b.customer_phone ? claimPhones.has(b.customer_phone) : false,
          needsReview:      b.needs_review ?? false,
          rescheduleRequestedFor: b.reschedule_requested_for ?? null,
          rescheduleNote:         b.reschedule_note ?? null,
          reviewReason:     b.review_reason ?? null,
          isRecurring:      !!b.contract_id,
          contract_id:      b.contract_id ?? null,
          alimtalk: {
            confirm:  b.confirm_alimtalk_sent_at ?? null,
            reminder: b.reminder_sent_at ?? null,
            onMyWay:  b.on_my_way_sent_at ?? null,
            report:   reportMap.get(b.id)?.reportSentAt ?? null,
            review:   reportMap.get(b.id)?.reviewSentAt ?? null,
            receipt:  b.receipt_sent_at ?? null,
          },
        }))}
        weekStart={startYmd}
        weekLabel={rangeLabel}
        prevNav={prevNav}
        nextNav={nextNav}
        view={view}
        initialBookingId={bookingParam ?? null}
      />
    </div>
  )
}
