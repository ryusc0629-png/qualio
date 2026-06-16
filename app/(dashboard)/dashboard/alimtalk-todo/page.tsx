import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AlimtalkTodoList } from '@/components/dashboard/alimtalk-todo-list'

export default async function AlimtalkTodoPage() {
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

  const [
    { data: completedBookings },
    { data: sentReportRows },
    { data: pendingReviewRaw },
    workersResult,
  ] = await Promise.all([
    // 완료된 예약 전체 (worker_id, customer_id 포함)
    db.from('bookings')
      .select('id, customer_name, customer_phone, scheduled_at, final_price, service_address, customer_id, quotes!quote_id(cleaning_type)')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: false }),

    // 알림톡 발송된 보고서의 booking_id
    db.from('reports')
      .select('booking_id')
      .eq('business_id', businessId)
      .not('kakao_sent_at', 'is', null),

    // 리뷰 요청 미발송 보고서
    db.from('reports')
      .select('id, booking_id')
      .eq('business_id', businessId)
      .not('kakao_sent_at', 'is', null)
      .is('review_request_sent_at', null),

    // 업체 소속 직원·도급사
    db.from('workers' as never)
      .select('id, name' as never)
      .eq('business_id' as never, businessId)
      .eq('is_active' as never, true) as unknown as Promise<{ data: { id: string; name: string }[] | null }>,
  ])

  // worker id → name 맵
  const workerMap = new Map<string, string>(
    (workersResult.data ?? []).map((w) => [w.id, w.name])
  )

  // 보고서 미발송 예약 필터링
  const sentSet = new Set((sentReportRows ?? []).map((r) => r.booking_id))

  type CompletedBookingRow = {
    id: string; customer_name: string; customer_phone: string | null
    scheduled_at: string; final_price: number; service_address: string | null
    customer_id: string | null
    worker_id?: string | null
    quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
  }

  const unreportedBookings = (completedBookings ?? [])
    .filter((b) => !sentSet.has(b.id))
    .map((b) => {
      const row = b as unknown as CompletedBookingRow
      const qt  = Array.isArray(row.quotes) ? row.quotes[0] : row.quotes
      return {
        bookingId:       row.id,
        customer_name:   row.customer_name,
        customer_phone:  row.customer_phone,
        scheduled_at:    row.scheduled_at,
        final_price:     row.final_price,
        service_address: row.service_address,
        customer_id:     row.customer_id,
        cleaning_type:   qt?.cleaning_type ?? null,
        worker_name:     row.worker_id ? (workerMap.get(row.worker_id) ?? null) : null,
      }
    })

  // 리뷰 미요청 목록 — 예약에서 고객명 + worker_id 조회
  type PendingReview = { id: string; booking_id: string }
  const pendingReviews = (pendingReviewRaw ?? []) as PendingReview[]
  const reviewBookingIds = pendingReviews.map((r) => r.booking_id)

  type ReviewBookingRow = {
    id: string; customer_name: string; customer_phone: string | null
    scheduled_at: string; customer_id: string | null; worker_id?: string | null
  }
  const bookingDetailMap = new Map<string, ReviewBookingRow>()
  if (reviewBookingIds.length > 0) {
    const { data: reviewBookings } = await db
      .from('bookings')
      .select('id, customer_name, customer_phone, scheduled_at, customer_id')
      .in('id', reviewBookingIds)
    for (const b of reviewBookings ?? []) {
      bookingDetailMap.set(b.id, b as unknown as ReviewBookingRow)
    }
  }

  const unreviewedItems = pendingReviews.map((r) => {
    const b = bookingDetailMap.get(r.booking_id)
    return {
      reportId:       r.id,
      customer_name:  b?.customer_name ?? '고객',
      customer_phone: b?.customer_phone ?? null,
      scheduled_at:   b?.scheduled_at ?? '',
      customer_id:    b?.customer_id ?? null,
      worker_name:    b?.worker_id ? (workerMap.get(b.worker_id) ?? null) : null,
    }
  })

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          대시보드
        </Link>
        <h1 className="text-2xl font-bold">알림톡 발송</h1>
        <p className="text-sm text-muted-foreground mt-1">
          버튼을 누르면 고객에게 카카오 알림톡이 바로 발송돼요
        </p>
      </div>

      <AlimtalkTodoList
        unreportedBookings={unreportedBookings}
        unreviewedItems={unreviewedItems}
      />
    </div>
  )
}
