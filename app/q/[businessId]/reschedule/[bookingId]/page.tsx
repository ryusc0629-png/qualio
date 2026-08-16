import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { RescheduleForm } from './reschedule-form'

// 예약 확정 알림톡(V2)의 '일정 변경 요청' 버튼이 여는 고객용 화면.
// 로그인 없이 열리므로 예약 id + 업체 id가 모두 맞아야만 보여준다.
interface PageProps {
  params: Promise<{ businessId: string; bookingId: string }>
}

export default async function ReschedulePage({ params }: PageProps) {
  const { businessId, bookingId } = await params
  const db = createServiceClient()

  const { data: booking } = await db
    .from('bookings')
    .select('id, customer_name, scheduled_at, service_address, status, businesses!business_id(name, phone)')
    .eq('id', bookingId)
    .eq('business_id', businessId)
    .maybeSingle() as unknown as {
      data: {
        id: string
        customer_name: string | null
        scheduled_at: string
        service_address: string | null
        status: string
        businesses: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null
      } | null
    }

  if (!booking) notFound()

  const biz = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
  const closed = ['completed', 'cancelled', 'no_show'].includes(booking.status)

  const currentLabel = new Date(booking.scheduled_at).toLocaleString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 py-10">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-6 space-y-5">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{biz?.name}</p>
          <h1 className="text-lg font-bold">일정 변경 요청</h1>
        </div>

        {/* 지금 잡힌 일정 — 고객이 무엇을 바꾸는지 먼저 확인시킨다 */}
        <div className="rounded-xl bg-slate-50 border p-4 space-y-1">
          <p className="text-xs text-muted-foreground">지금 예약된 일정</p>
          <p className="text-sm font-semibold">{currentLabel}</p>
          {booking.service_address && (
            <p className="text-xs text-muted-foreground">{booking.service_address}</p>
          )}
        </div>

        {closed ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              이미 끝난 예약이라 여기서는 변경할 수 없어요.
              {biz?.phone ? ' 아래로 연락 주시면 도와드릴게요.' : ' 업체로 연락 부탁드려요.'}
            </p>
            {biz?.phone && (
              <a
                href={`tel:${biz.phone}`}
                className="flex h-12 items-center justify-center rounded-xl bg-primary text-white font-semibold"
              >
                {biz.name}에 전화하기
              </a>
            )}
          </div>
        ) : (
          <RescheduleForm
            bookingId={booking.id}
            businessId={businessId}
            businessPhone={biz?.phone ?? null}
            businessName={biz?.name ?? ''}
          />
        )}
      </div>
    </div>
  )
}
