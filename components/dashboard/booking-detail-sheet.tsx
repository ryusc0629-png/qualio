'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  Phone, MapPin, Clock, User,
  Pencil, Check, X, CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  assignBookingAction,
  updateBookingTimeAction,
  cancelBookingFromScheduleAction,
  updateBookingStatusAction,
} from '@/lib/actions/workers'

// ── 타입 ──────────────────────────────────────────────────

interface Worker {
  id: string
  name: string
  type: string
  color: string
  phone: string | null
}

interface Booking {
  id: string
  customer_name: string
  customer_phone: string | null
  service_address: string | null
  scheduled_at: string
  final_price: number
  status: string
  worker_id: string | null
  cleaning_type: string | null
}

interface Props {
  booking: Booking | null
  workers: Worker[]
  onClose: () => void
  onWorkerChange: (bookingId: string, newWorkerId: string | null) => void
  onTimeChange:   (bookingId: string, newScheduledAt: string) => void
  onCancel:       (bookingId: string) => void
  onStatusChange?: (bookingId: string, newStatus: string) => void
}

// ── 상태 배지 ────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  confirmed:   { label: '예약 확정',  className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: '진행 중',   className: 'bg-orange-100 text-orange-700' },
  completed:   { label: '완료',      className: 'bg-green-100 text-green-700' },
  cancelled:   { label: '취소됨',    className: 'bg-red-100 text-red-700' },
  no_show:     { label: '노쇼',      className: 'bg-gray-100 text-gray-600' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.className}`}>
      {s.label}
    </span>
  )
}

// ── 섹션 행 ──────────────────────────────────────────────

function Row({ icon, label, children }: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────

export function BookingDetailSheet({
  booking,
  workers,
  onClose,
  onWorkerChange,
  onTimeChange,
  onCancel,
  onStatusChange,
}: Props) {
  const [editingTime, setEditingTime] = useState(false)
  const [timeValue, setTimeValue]     = useState('')

  const isCancelled = !booking ||
    ['cancelled', 'no_show'].includes(booking.status)

  // 시간 변경 액션
  const { execute: saveTime, isPending: timePending } = useAction(updateBookingTimeAction, {
    onSuccess: ({ data }) => {
      if (!booking || !data?.newScheduledAt) return
      onTimeChange(booking.id, data.newScheduledAt)
      setEditingTime(false)
      toast.success('시간을 변경했어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 담당자 변경 액션
  const { execute: assignWorker, isPending: assignPending } = useAction(assignBookingAction, {
    onSuccess: () => toast.success('담당자를 변경했어요!'),
    onError:   ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 예약 취소 액션
  const { execute: cancelBooking, isPending: cancelPending } = useAction(cancelBookingFromScheduleAction, {
    onSuccess: () => {
      if (!booking) return
      toast.success('예약이 취소됐어요')
      onCancel(booking.id)
      onClose()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 상태 변경 액션
  const { execute: updateStatus, isPending: statusPending } = useAction(updateBookingStatusAction, {
    onSuccess: ({ data }) => {
      if (!booking || !data?.newStatus) return
      onStatusChange?.(booking.id, data.newStatus)
      toast.success('상태가 변경됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const handleWorkerChange = (value: string) => {
    if (!booking) return
    const newWorkerId = value === 'null' ? null : value
    const currentDate = format(new Date(booking.scheduled_at), 'yyyy-MM-dd')

    // 낙관적 업데이트
    onWorkerChange(booking.id, newWorkerId)

    assignWorker({
      bookingId: booking.id,
      workerId:  newWorkerId,
      newDate:   currentDate,
    })
  }

  const handleSaveTime = () => {
    if (!booking || !timeValue) return
    saveTime({ bookingId: booking.id, newTime: timeValue })
  }

  const handleCancelBooking = () => {
    if (!booking) return
    if (!confirm('예약을 취소할까요? 취소 후에는 되돌릴 수 없습니다.')) return
    cancelBooking({ bookingId: booking.id })
  }

  // 시간 편집 모드 시작 시 현재 시간으로 초기화
  const startEditTime = () => {
    if (!booking) return
    setTimeValue(format(new Date(booking.scheduled_at), 'HH:mm'))
    setEditingTime(true)
  }

  const scheduledDate = booking
    ? format(new Date(booking.scheduled_at), 'M월 d일 (EEE)', { locale: ko })
    : ''
  const scheduledTime = booking
    ? format(new Date(booking.scheduled_at), 'HH:mm')
    : ''
  const currentWorker = workers.find((w) => w.id === booking?.worker_id)
  const formattedPrice = booking
    ? new Intl.NumberFormat('ko-KR').format(booking.final_price) + '원'
    : ''
  const mapsUrl = booking?.service_address
    ? `https://map.kakao.com/?q=${encodeURIComponent(booking.service_address)}`
    : null

  return (
    <Sheet open={!!booking} onOpenChange={(isOpen: boolean) => { if (!isOpen) { setEditingTime(false); onClose() } }}>
      <SheetContent side="left" className="w-full sm:max-w-md flex flex-col p-0" showCloseButton={false}>

        {/* 헤더 */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-xl leading-tight">
                {booking?.customer_name}
              </SheetTitle>
              <div className="mt-1.5">
                <StatusBadge status={booking?.status ?? 'confirmed'} />
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-2">

          {/* 전화하기 — 연락처 있을 때만 */}
          {booking?.customer_phone && (
            <a href={`tel:${booking.customer_phone}`} className="block mt-3 mb-4">
              <Button className="w-full h-12 gap-2 text-sm font-semibold">
                <Phone className="h-4 w-4" />
                전화하기 · {booking.customer_phone}
              </Button>
            </a>
          )}

          {/* 일정 정보 */}
          <div className="rounded-xl border border-border bg-card px-4 mb-4">
            {/* 날짜 */}
            <Row icon={<CalendarDays className="h-4 w-4" />} label="예약 날짜">
              <span className="font-medium">{scheduledDate}</span>
            </Row>

            {/* 시간 */}
            <Row icon={<Clock className="h-4 w-4" />} label="예약 시간">
              {editingTime ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    className="border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-28"
                  />
                  <button
                    onClick={handleSaveTime}
                    disabled={timePending || !timeValue}
                    className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    aria-label="저장"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingTime(false)}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                    aria-label="취소"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {timePending && (
                    <span className="text-xs text-muted-foreground">저장 중...</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{scheduledTime}</span>
                  {!isCancelled && (
                    <button
                      onClick={startEditTime}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Pencil className="h-3 w-3" />
                      수정
                    </button>
                  )}
                </div>
              )}
            </Row>

            {/* 담당자 */}
            <Row icon={<User className="h-4 w-4" />} label="담당자">
              {isCancelled ? (
                <span className="font-medium">
                  {currentWorker ? currentWorker.name : '미배정'}
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    value={booking?.worker_id ?? 'null'}
                    onValueChange={handleWorkerChange}
                    disabled={assignPending}
                  >
                    <SelectTrigger className="h-8 text-sm w-40 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
                          미배정
                        </span>
                      </SelectItem>
                      {workers.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: w.color }}
                            />
                            {w.name}
                            <span className="text-muted-foreground text-xs">
                              {w.type === 'employee' ? '직원' : '도급사'}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assignPending && (
                    <span className="text-xs text-muted-foreground">저장 중...</span>
                  )}
                </div>
              )}
            </Row>
          </div>

          {/* 서비스 정보 */}
          <div className="rounded-xl border border-border bg-card px-4 mb-4">
            {booking?.cleaning_type && (
              <Row icon={<span className="text-base">🧹</span>} label="서비스">
                <span className="font-medium">{booking.cleaning_type}</span>
              </Row>
            )}

            {booking?.service_address && (
              <Row icon={<MapPin className="h-4 w-4" />} label="주소">
                <div className="flex items-start gap-2">
                  <span className="font-medium leading-snug">{booking.service_address}</span>
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-primary hover:underline whitespace-nowrap mt-0.5"
                    >
                      지도 보기
                    </a>
                  )}
                </div>
              </Row>
            )}

            {booking && booking.final_price > 0 && (
              <Row icon={<span className="text-base">💰</span>} label="결제 금액">
                <span className="font-semibold text-foreground">{formattedPrice}</span>
              </Row>
            )}
          </div>

        </div>

        {/* 하단 — 상태 변경 + 취소 */}
        {!isCancelled && (
          <div className="px-5 pb-5 pt-3 border-t border-border space-y-2">
            {/* 상태 변경 버튼 */}
            {booking?.status === 'confirmed' && (
              <Button
                className="w-full h-12 font-semibold gap-2 bg-amber-500 hover:bg-amber-600"
                disabled={statusPending}
                onClick={() => updateStatus({ bookingId: booking.id, status: 'in_progress' })}
              >
                {statusPending ? '처리 중...' : '작업 시작하기'}
              </Button>
            )}
            {booking?.status === 'in_progress' && (
              <Button
                className="w-full h-12 font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700"
                disabled={statusPending}
                onClick={() => {
                  if (!confirm('작업을 완료 처리할까요?')) return
                  updateStatus({ bookingId: booking.id, status: 'completed' })
                }}
              >
                {statusPending ? '처리 중...' : '작업 완료 처리'}
              </Button>
            )}
            {booking?.status === 'completed' && (
              <Button
                variant="outline"
                className="w-full h-12 font-semibold gap-2"
                disabled={statusPending}
                onClick={() => {
                  if (!confirm('진행 중 상태로 되돌릴까요?')) return
                  updateStatus({ bookingId: booking.id, status: 'in_progress' })
                }}
              >
                {statusPending ? '처리 중...' : '진행 중으로 되돌리기'}
              </Button>
            )}

            {/* 취소 버튼 */}
            {booking?.status !== 'completed' && (
              <Button
                variant="outline"
                className="w-full h-12 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive font-semibold"
                disabled={cancelPending}
                onClick={handleCancelBooking}
              >
                {cancelPending ? '취소 중...' : '예약 취소하기'}
              </Button>
            )}
          </div>
        )}

      </SheetContent>
    </Sheet>
  )
}
