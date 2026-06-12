import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddBookingForm } from '@/components/dashboard/add-booking-form'
import { BookingStatusSelect } from '@/components/dashboard/booking-status-select'
import { MapPin, Phone, Calendar } from 'lucide-react'

const statusLabel: Record<string, { text: string; className: string }> = {
  confirmed:   { text: '확정',   className: 'bg-primary/10 text-primary' },
  in_progress: { text: '진행중', className: 'bg-amber-100 text-amber-800' },
  completed:   { text: '완료',   className: 'bg-green-100 text-green-800' },
  cancelled:   { text: '취소',   className: 'bg-gray-100 text-gray-500' },
  no_show:     { text: '노쇼',   className: 'bg-red-100 text-red-700' },
}

const tierLabel: Record<string, string> = {
  good: '기본', better: '추천', best: '프리미엄',
}

export default async function BookingsPage() {
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

  const { data: bookings } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, service_address, scheduled_at, selected_tier, final_price, status, created_at')
    .eq('business_id', profile.business_id)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">예약 관리</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            전화로 받은 예약도 직접 추가할 수 있어요
          </p>
        </div>
        <AddBookingForm />
      </div>

      {!bookings || bookings.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">아직 예약이 없어요</p>
          <p className="text-xs text-muted-foreground">
            고객이 견적 폼으로 예약하거나, 위 버튼으로 직접 추가해보세요
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((booking) => {
            const status = statusLabel[booking.status] ?? { text: booking.status, className: 'bg-gray-100 text-gray-600' }
            const scheduledDate = new Date(booking.scheduled_at).toLocaleDateString('ko-KR', {
              month: 'short', day: 'numeric', weekday: 'short',
            })
            const scheduledTime = new Date(booking.scheduled_at).toLocaleTimeString('ko-KR', {
              hour: '2-digit', minute: '2-digit',
            })

            return (
              <div
                key={booking.id}
                className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{booking.customer_name}</p>
                      {booking.selected_tier && (
                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          {tierLabel[booking.selected_tier] ?? booking.selected_tier}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                        {status.text}
                      </span>
                    </div>

                    <div className="mt-1.5 space-y-0.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {scheduledDate} {scheduledTime}
                      </p>
                      {booking.customer_phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          {booking.customer_phone}
                        </p>
                      )}
                      {booking.service_address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {booking.service_address}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <p className="text-base font-bold tabular-nums">
                      {booking.final_price.toLocaleString('ko-KR')}원
                    </p>
                    <BookingStatusSelect
                      bookingId={booking.id}
                      currentStatus={booking.status}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
