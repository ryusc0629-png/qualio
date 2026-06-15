'use client'

import { useState } from 'react'
import { Calendar, Phone, MapPin, FileText, X } from 'lucide-react'
import { BookingStatusSelect } from '@/components/dashboard/booking-status-select'
import { RescheduleBookingButton } from '@/components/dashboard/reschedule-booking-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const BOOKING_STATUS: Record<string, { text: string; className: string }> = {
  confirmed:   { text: '확정',   className: 'bg-primary/10 text-primary' },
  in_progress: { text: '진행중', className: 'bg-amber-100 text-amber-800' },
  completed:   { text: '완료',   className: 'bg-green-100 text-green-800' },
  cancelled:   { text: '취소',   className: 'bg-gray-100 text-gray-500' },
  no_show:     { text: '노쇼',   className: 'bg-red-100 text-red-700' },
}

const TIER_LABEL: Record<string, string> = {
  good: '기본', better: '추천', best: '프리미엄',
}

export type BookingItem = {
  id: string
  customer_name: string
  customer_phone: string | null
  service_address: string | null
  scheduled_at: string
  selected_tier: string | null
  final_price: number
  status: string
  memo: string | null
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export function BookingCardList({ bookings }: { bookings: BookingItem[] }) {
  const [selected, setSelected] = useState<BookingItem | null>(null)

  const activeBookings = bookings.filter((b) => b.status === 'confirmed' || b.status === 'in_progress')
  const doneBookings   = bookings.filter((b) => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show')

  const Card = ({ booking }: { booking: BookingItem }) => {
    const status = BOOKING_STATUS[booking.status] ?? { text: booking.status, className: 'bg-gray-100 text-gray-600' }
    const isActive = booking.status === 'confirmed' || booking.status === 'in_progress'

    return (
      <div
        onClick={() => setSelected(booking)}
        className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors cursor-pointer"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">{booking.customer_name}</p>
              {booking.selected_tier && (
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  {TIER_LABEL[booking.selected_tier] ?? booking.selected_tier}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                {status.text}
              </span>
            </div>
            <div className="mt-1.5 space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3 shrink-0" />
                {formatDate(booking.scheduled_at)} {formatTime(booking.scheduled_at)}
              </p>
              {booking.customer_phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3 shrink-0" />{booking.customer_phone}
                </p>
              )}
              {booking.service_address && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />{booking.service_address}
                </p>
              )}
            </div>
          </div>
          <div
            className="shrink-0 flex flex-col items-end gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold tabular-nums">{booking.final_price.toLocaleString('ko-KR')}원</p>
            <BookingStatusSelect bookingId={booking.id} currentStatus={booking.status} />
            {isActive && (
              <RescheduleBookingButton
                bookingId={booking.id}
                scheduledAt={booking.scheduled_at}
                customerPhone={booking.customer_phone}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 활성 예약 */}
      {activeBookings.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">처리할 예약이 없어요</p>
          <p className="text-xs text-muted-foreground">전화로 받은 예약은 오른쪽 위 버튼으로 직접 추가해보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeBookings.map((b) => <Card key={b.id} booking={b} />)}
        </div>
      )}

      {/* 완료·취소 내역 */}
      {doneBookings.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 select-none">
            <span className="text-xs border border-border rounded px-1.5 py-0.5 group-open:hidden">▶ 완료·취소 내역 {doneBookings.length}건 보기</span>
            <span className="text-xs border border-border rounded px-1.5 py-0.5 hidden group-open:inline">▼ 접기</span>
          </summary>
          <div className="space-y-2 mt-2">
            {doneBookings.map((b) => <Card key={b.id} booking={b} />)}
          </div>
        </details>
      )}

      {/* 예약 상세 Dialog */}
      <Dialog open={!!selected} onOpenChange={(open: boolean) => { if (!open) setSelected(null) }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          {selected && (() => {
            const status = BOOKING_STATUS[selected.status] ?? { text: selected.status, className: 'bg-gray-100 text-gray-600' }
            const isActive = selected.status === 'confirmed' || selected.status === 'in_progress'
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selected.customer_name}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                      {status.text}
                    </span>
                  </DialogTitle>
                </DialogHeader>

                <div className="mt-6 space-y-5">
                  {/* 예약 일시 */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">예약 일시</p>
                    <p className="text-sm font-semibold">
                      {formatDate(selected.scheduled_at)} {formatTime(selected.scheduled_at)}
                    </p>
                  </div>

                  {/* 플랜 · 금액 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">선택 플랜</p>
                      <p className="text-sm">{selected.selected_tier ? (TIER_LABEL[selected.selected_tier] ?? selected.selected_tier) : '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">최종 금액</p>
                      <p className="text-sm font-bold tabular-nums">{selected.final_price.toLocaleString('ko-KR')}원</p>
                    </div>
                  </div>

                  {/* 연락처 */}
                  {selected.customer_phone && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">연락처</p>
                      <a href={`tel:${selected.customer_phone}`} className="text-sm text-primary font-medium">
                        {selected.customer_phone}
                      </a>
                    </div>
                  )}

                  {/* 주소 */}
                  {selected.service_address && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">청소 주소</p>
                      <p className="text-sm">{selected.service_address}</p>
                    </div>
                  )}

                  {/* 메모 */}
                  {selected.memo && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" /> 메모
                      </p>
                      <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{selected.memo}</p>
                    </div>
                  )}

                  {/* 등록일 */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">등록일</p>
                    <p className="text-xs text-muted-foreground">{formatDate(selected.created_at)}</p>
                  </div>

                  {/* 상태 변경 */}
                  <div className="pt-2 border-t border-border space-y-3">
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-between"
                    >
                      <p className="text-sm font-medium">상태 변경</p>
                      <BookingStatusSelect bookingId={selected.id} currentStatus={selected.status} />
                    </div>
                    {isActive && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <RescheduleBookingButton
                          bookingId={selected.id}
                          scheduledAt={selected.scheduled_at}
                          customerPhone={selected.customer_phone}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </>
  )
}
