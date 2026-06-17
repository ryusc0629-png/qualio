'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { addDays, format, getDaysInMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Phone, MapPin, UserPlus, Trash2, CheckCircle2, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import { assignBookingAction, addWorkerAction, deleteWorkerAction } from '@/lib/actions/workers'
import { BookingDetailSheet } from '@/components/dashboard/booking-detail-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

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
  customer_id: string | null
  reportId?: string | null
  reviewSent?: boolean
  hasReviewHistory?: boolean
}

interface Props {
  businessId: string
  workers: Worker[]
  bookings: Booking[]
  weekStart: string
  weekLabel: string
  prevNav: string
  nextNav: string
  view: 'day' | 'week' | 'month'
}

const WORKER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4',
]

// ── 드롭 셀 ─────────────────────────────────────────────

function DroppableCell({
  id,
  children,
  isOver,
}: {
  id: string
  children: React.ReactNode
  isOver: boolean
}) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={[
        'min-h-[72px] p-1.5 rounded-lg border transition-colors space-y-1.5',
        isOver
          ? 'border-primary bg-primary/5 border-dashed'
          : 'border-transparent hover:border-border',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

// ── 예약 카드 (드래그 가능) ───────────────────────────────

function BookingCard({
  booking,
  color,
  isDragging = false,
}: {
  booking: Booking
  color: string
  isDragging?: boolean
}) {
  const time = format(new Date(booking.scheduled_at), 'HH:mm')
  const serviceName = booking.cleaning_type ?? '직접 예약'
  const isCompleted = booking.status === 'completed'

  return (
    <div
      className={[
        'rounded-lg px-2.5 py-2 text-xs shadow-sm select-none',
        isDragging ? 'opacity-50' : 'opacity-100',
        isCompleted ? 'text-gray-500 border border-gray-200' : 'text-white',
      ].join(' ')}
      style={{ backgroundColor: isCompleted ? '#f3f4f6' : color }}
    >
      <div className="flex items-center gap-1">
        {isCompleted && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
        {booking.hasReviewHistory && !isCompleted && <span className="shrink-0" title="리뷰 작성 고객">⭐</span>}
        <p className={`font-bold truncate ${isCompleted ? 'line-through' : ''}`}>{booking.customer_name}</p>
      </div>
      <p className={`truncate ${isCompleted ? 'opacity-60' : 'opacity-80'}`}>{time} · {serviceName}</p>
      {booking.service_address && (
        <p className={`truncate flex items-center gap-0.5 mt-0.5 ${isCompleted ? 'opacity-50' : 'opacity-70'}`}>
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {booking.service_address}
        </p>
      )}
    </div>
  )
}

// ── 드래그 가능한 카드 래퍼 ──────────────────────────────

function DraggableBookingCard({
  booking,
  color,
  onClick,
}: {
  booking: Booking
  color: string
  onClick: () => void
}) {
  const isCompleted = booking.status === 'completed'
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking.id,
    data: { booking },
    disabled: isCompleted,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={isCompleted ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing touch-none'}
      onClick={onClick}
      {...(isCompleted ? {} : listeners)}
      {...attributes}
    >
      <BookingCard booking={booking} color={color} isDragging={isDragging} />
    </div>
  )
}

// ── 직원 추가 다이얼로그 ─────────────────────────────────

function AddWorkerDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [type, setType] = useState('employee')
  const [color, setColor] = useState(WORKER_COLORS[0]!)

  const { execute, isPending } = useAction(addWorkerAction, {
    onSuccess: () => {
      toast.success('등록됐어요!')
      setOpen(false)
      setName(''); setPhone('')
      window.location.replace(window.location.href)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '등록에 실패했어요'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <UserPlus className="h-3.5 w-3.5" />
          직원/도급사 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>직원·도급사 등록</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">이름 (필수)</Label>
            <Input
              placeholder="홍길동 또는 청소파트너"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">연락처</Label>
            <Input
              placeholder="01012345678"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">유형</Label>
            <div className="flex gap-2">
              {[
                { value: 'employee',   label: '직원' },
                { value: 'contractor', label: '도급사' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={[
                    'flex-1 h-10 rounded-lg border text-sm font-medium transition-colors',
                    type === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">캘린더 색상</Label>
            <div className="flex gap-2 flex-wrap">
              {WORKER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={[
                    'w-8 h-8 rounded-full transition-all',
                    color === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : '',
                  ].join(' ')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Button
            className="w-full h-11"
            disabled={isPending || !name.trim()}
            onClick={() => execute({ name: name.trim(), phone: phone || undefined, type, color })}
          >
            {isPending ? '등록 중...' : '등록하기'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── 현장 앱 링크 복사 버튼 ────────────────────────────────

function CopyFieldLinkButton({ workerId, workerName }: { workerId: string; workerName: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const url = `${window.location.origin}/field/${workerId}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success(`${workerName}님 링크를 복사했어요`)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={[
        'w-full flex items-center justify-center gap-1 text-[10px] px-1.5 py-1 rounded border transition-colors',
        copied
          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
          : 'border-border bg-muted/50 text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary',
      ].join(' ')}
    >
      <Smartphone className="h-2.5 w-2.5 shrink-0" />
      {copied ? '복사됐어요!' : '앱 링크 복사'}
    </button>
  )
}

// ── 직원 삭제 버튼 ───────────────────────────────────────

function DeleteWorkerButton({ workerId, workerName }: { workerId: string; workerName: string }) {
  const { execute, isPending } = useAction(deleteWorkerAction, {
    onSuccess: () => {
      toast.success(`${workerName}님을 삭제했어요`)
      window.location.replace(window.location.href)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '삭제에 실패했어요'),
  })

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (confirm(`${workerName}님을 삭제할까요? 배정된 예약은 미배정으로 변경됩니다.`)) {
          execute({ workerId })
        }
      }}
      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
    >
      <Trash2 className="h-3 w-3" />
    </button>
  )
}

// ── 메인 보드 ────────────────────────────────────────────

const VIEW_OPTIONS = [
  { key: 'day',   label: '일' },
  { key: 'week',  label: '주' },
  { key: 'month', label: '월' },
] as const

export function ScheduleBoard({
  workers,
  bookings: initialBookings,
  weekStart,
  weekLabel,
  prevNav,
  nextNav,
  view,
}: Props) {
  const [bookings, setBookings] = useState(initialBookings)
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const { execute: assignBooking } = useAction(assignBookingAction, {
    onError: ({ error }) => {
      toast.error(error.serverError ?? '저장에 실패했어요. 다시 시도해주세요')
      setBookings(initialBookings) // 롤백
    },
  })

  // 뷰에 따라 날짜 열 생성
  const dayCount = view === 'day' ? 1
    : view === 'month' ? getDaysInMonth(new Date(weekStart))
    : 7

  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = addDays(new Date(weekStart), i)
    return {
      date:    format(d, 'yyyy-MM-dd'),
      label:   view === 'month'
        ? format(d, 'd일 (EEE)', { locale: ko })
        : format(d, 'M/d (EEE)', { locale: ko }),
      isToday: format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'),
    }
  })

  // rows: 미배정 + 각 worker
  const rows: Array<{ id: string | null; label: string; color: string; phone?: string | null; type?: string }> = [
    { id: null, label: '미배정', color: '#94a3b8' },
    ...workers.map((w) => ({ id: w.id, label: w.name, color: w.color, phone: w.phone, type: w.type })),
  ]

  const getBookingsForCell = useCallback((workerId: string | null, date: string) => {
    return bookings.filter((b) => {
      const bDate = format(new Date(b.scheduled_at), 'yyyy-MM-dd')
      return b.worker_id === workerId && bDate === date
    })
  }, [bookings])

  const getWorkerColor = useCallback((workerId: string | null) => {
    if (!workerId) return '#94a3b8'
    return workers.find((w) => w.id === workerId)?.color ?? '#94a3b8'
  }, [workers])

  // Sheet 콜백 — 낙관적 업데이트
  const handleSheetWorkerChange = (bookingId: string, newWorkerId: string | null) => {
    setBookings((prev) =>
      prev.map((b) => b.id === bookingId ? { ...b, worker_id: newWorkerId } : b)
    )
  }

  const handleSheetTimeChange = (bookingId: string, newScheduledAt: string) => {
    setBookings((prev) =>
      prev.map((b) => b.id === bookingId ? { ...b, scheduled_at: newScheduledAt } : b)
    )
  }

  const handleSheetCancel = (bookingId: string) => {
    setBookings((prev) => prev.filter((b) => b.id !== bookingId))
    setSelectedBookingId(null)
  }

  const handleSheetStatusChange = (bookingId: string, newStatus: string) => {
    setBookings((prev) =>
      prev.map((b) => b.id === bookingId ? { ...b, status: newStatus } : b)
    )
  }

  const handleDragStart = (event: DragStartEvent) => {
    const booking = bookings.find((b) => b.id === event.active.id)
    setActiveBooking(booking ?? null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveBooking(null)
    setOverId(null)

    const { active, over } = event
    if (!over) return

    // dropId 형식: "workerId_date" 또는 "null_date"
    const [workerPart, ...dateParts] = String(over.id).split('_')
    const newDate   = dateParts.join('_')
    const newWorker = workerPart === 'null' ? null : workerPart!

    const booking = bookings.find((b) => b.id === active.id)
    if (!booking) return

    const prevDate = format(new Date(booking.scheduled_at), 'yyyy-MM-dd')
    if (booking.worker_id === newWorker && prevDate === newDate) return

    // 낙관적 업데이트
    setBookings((prev) =>
      prev.map((b) =>
        b.id === booking.id
          ? {
              ...b,
              worker_id: newWorker,
              scheduled_at: b.scheduled_at.replace(/^\d{4}-\d{2}-\d{2}/, newDate),
            }
          : b
      )
    )

    assignBooking({
      bookingId: booking.id,
      workerId:  newWorker,
      newDate,
    })
  }

  return (
    <div className="space-y-3">
      {/* 상단 컨트롤 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.location.replace(`/dashboard/schedule?view=${view}&date=${prevNav}`)}
            className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold min-w-[160px] text-center">{weekLabel}</span>
          <button
            onClick={() => window.location.replace(`/dashboard/schedule?view=${view}&date=${nextNav}`)}
            className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => window.location.replace(`/dashboard/schedule?view=${view}`)}
            className="text-xs text-primary hover:underline ml-1"
          >
            오늘
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* 뷰 전환 */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => window.location.replace(`/dashboard/schedule?view=${opt.key}`)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === opt.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <AddWorkerDialog />
        </div>
      </div>

      {/* 캘린더 그리드 */}
      <DndContext
        id="schedule-board-dnd"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto -mx-4 px-4 pb-2">
          <div style={{ minWidth: view === 'day' ? '400px' : view === 'month' ? '2200px' : '1050px' }}>

            {/* 헤더 행: 요일 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: view === 'day'
                  ? '140px 1fr'
                  : `140px repeat(${dayCount}, ${view === 'month' ? '64px' : '130px'})`,
                marginBottom: '4px',
              }}
            >
              <div
                className="bg-background"
                style={view === 'month' ? { position: 'sticky', left: 0, zIndex: 10 } : undefined}
              />
              {days.map((day) => (
                <div
                  key={day.date}
                  className={[
                    'text-center text-xs font-semibold py-2 rounded-lg',
                    day.isToday ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                  ].join(' ')}
                >
                  {day.label}
                </div>
              ))}
            </div>

            {/* 데이터 행: worker × day */}
            <div className="space-y-1">
              {rows.map((row) => (
                <div
                  key={String(row.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: view === 'day'
                      ? '140px 1fr'
                      : `140px repeat(${dayCount}, ${view === 'month' ? '64px' : '130px'})`,
                    alignItems: 'start',
                  }}
                >
                  {/* 작업자 레이블 */}
                  <div
                    className="flex flex-col gap-1.5 px-2 py-2 min-h-[72px] bg-background"
                    style={view === 'month' ? { position: 'sticky', left: 0, zIndex: 10 } : undefined}
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{row.label}</p>
                        {row.type && (
                          <p className="text-[10px] text-muted-foreground">
                            {row.type === 'employee' ? '직원' : '도급사'}
                          </p>
                        )}
                        {row.phone && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Phone className="h-2.5 w-2.5" />{row.phone}
                          </p>
                        )}
                      </div>
                      {row.id && (
                        <DeleteWorkerButton workerId={row.id} workerName={row.label} />
                      )}
                    </div>
                    {row.id && (
                      <CopyFieldLinkButton workerId={row.id} workerName={row.label} />
                    )}
                  </div>

                  {/* 날짜별 셀 */}
                  {days.map((day) => {
                    const cellId   = `${String(row.id)}_${day.date}`
                    const cellBookings = getBookingsForCell(row.id, day.date)

                    return (
                      <DroppableCell
                        key={cellId}
                        id={cellId}
                        isOver={overId === cellId}
                      >
                        {cellBookings.map((b) => (
                          <DraggableBookingCard
                            key={b.id}
                            booking={b}
                            color={getWorkerColor(b.worker_id)}
                            onClick={() => setSelectedBookingId(b.id)}
                          />
                        ))}
                      </DroppableCell>
                    )
                  })}
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* 드래그 중 오버레이 */}
        <DragOverlay>
          {activeBooking && (
            <div className="rotate-2 scale-105 shadow-xl">
              <BookingCard
                booking={activeBooking}
                color={getWorkerColor(activeBooking.worker_id)}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* 빈 상태 */}
      {bookings.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <p>이번 주 확정된 예약이 없어요</p>
          <p className="text-xs mt-1">예약 탭에서 예약을 추가하면 여기 표시돼요</p>
        </div>
      )}

      {/* 예약 상세 Sheet */}
      <BookingDetailSheet
        booking={selectedBooking}
        workers={workers}
        onClose={() => setSelectedBookingId(null)}
        onWorkerChange={handleSheetWorkerChange}
        onTimeChange={handleSheetTimeChange}
        onCancel={handleSheetCancel}
        onStatusChange={handleSheetStatusChange}
      />
    </div>
  )
}
