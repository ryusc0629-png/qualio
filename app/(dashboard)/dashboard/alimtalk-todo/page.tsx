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
  ] = await Promise.all([
    // 완료된 예약 전체
    db.from('bookings')
      .select('id, customer_name, customer_phone, scheduled_at, final_price, quotes!quote_id(cleaning_type)')
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
  ])

  // 보고서 미발송 예약 필터링
  const sentSet = new Set((sentReportRows ?? []).map((r) => r.booking_id))
  const unreportedBookings = (completedBookings ?? [])
    .filter((b) => !sentSet.has(b.id))
    .map((b) => ({
      bookingId:      b.id,
      customer_name:  b.customer_name,
      customer_phone: b.customer_phone,
      scheduled_at:   b.scheduled_at,
    }))

  // 리뷰 미요청 목록 — 예약에서 고객명 조회
  type PendingReview = { id: string; booking_id: string }
  const pendingReviews = (pendingReviewRaw ?? []) as PendingReview[]
  const reviewBookingIds = pendingReviews.map((r) => r.booking_id)

  const bookingNameMap = new Map<string, { customer_name: string; customer_phone: string | null; scheduled_at: string }>()
  if (reviewBookingIds.length > 0) {
    const { data: reviewBookings } = await db
      .from('bookings')
      .select('id, customer_name, customer_phone, scheduled_at')
      .in('id', reviewBookingIds)
    for (const b of reviewBookings ?? []) {
      bookingNameMap.set(b.id, {
        customer_name:  b.customer_name,
        customer_phone: b.customer_phone,
        scheduled_at:   b.scheduled_at,
      })
    }
  }

  const unreviewedItems = pendingReviews.map((r) => ({
    reportId:       r.id,
    customer_name:  bookingNameMap.get(r.booking_id)?.customer_name ?? '고객',
    customer_phone: bookingNameMap.get(r.booking_id)?.customer_phone ?? null,
    scheduled_at:   bookingNameMap.get(r.booking_id)?.scheduled_at ?? '',
  }))

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
