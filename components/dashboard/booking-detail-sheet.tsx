'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import Link from 'next/link'
import {
  Phone, Clock, User, ChevronRight,
  Pencil, Check, X, CalendarDays, CheckCircle2, Send, Star, Users, PhoneCall,
} from 'lucide-react'
import { MapNavButton } from '@/components/dashboard/map-nav-button'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import { BookingItemsEditor } from '@/components/dashboard/booking-items-editor'
import { AddClaimForm } from '@/components/dashboard/add-claim-form'
import { ClaimsStatusButton } from '@/components/dashboard/claims-status-button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  assignBookingAction,
  updateBookingWorkersAction,
  updateBookingTimeAction,
  cancelBookingFromScheduleAction,
  restoreBookingFromScheduleAction,
  updateBookingStatusAction,
} from '@/lib/actions/workers'
import { clearBookingReviewAction } from '@/lib/actions/bookings'
import { sendReviewRequestAction } from '@/lib/actions/reports'

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
  workerIds: string[]
  cleaning_type: string | null
  customer_id: string | null
  reportId?: string | null
  reviewSent?: boolean
  hasReviewHistory?: boolean
  hasOpenClaim?: boolean
  needsReview?: boolean
  reviewReason?: string | null
  cancellation_reason?: string | null
}

interface Props {
  booking: Booking | null
  workers: Worker[]
  onClose: () => void
  onWorkersChange: (bookingId: string, newWorkerIds: string[]) => void
  onTimeChange:    (bookingId: string, newScheduledAt: string) => void
  onCancel:        (bookingId: string) => void
  onStatusChange?: (bookingId: string, newStatus: string) => void
  // 클레임 등록/해결 시 캘린더 배지를 즉시 갱신 (새로고침 없이)
  onClaimChange?:  (bookingId: string, hasOpenClaim: boolean) => void
  // 검토 완료 처리 시 캘린더 배지를 즉시 갱신
  onReviewChange?: (bookingId: string, needsReview: boolean) => void
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
  onWorkersChange,
  onTimeChange,
  onCancel,
  onStatusChange,
  onClaimChange,
  onReviewChange,
}: Props) {
  const [editingTime, setEditingTime] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue]     = useState('')
  const [timeValue, setTimeValue]     = useState('')
  const [currentReportId, setCurrentReportId]     = useState<string | null>(null)
  const [currentReviewSent, setCurrentReviewSent] = useState(false)
  const [reviewDialogOpen, setReviewDialogOpen]   = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen]   = useState(false)
  const [cancelReason, setCancelReason]           = useState('')
  const [localWorkerIds, setLocalWorkerIds]       = useState<string[]>([])
  // 항목 편집으로 결제 금액이 바뀌면 즉시 반영 (편집기가 onTotalChange로 알려줌)
  const [liveTotal, setLiveTotal]                 = useState(0)
  // 검토 필요 여부 — '검토 완료' 누르면 즉시 숨김
  const [localNeedsReview, setLocalNeedsReview]   = useState(false)

  // booking이 바뀔 때마다 상태 초기화
  useEffect(() => {
    setCurrentReportId(booking?.reportId ?? null)
    setCurrentReviewSent(booking?.reviewSent ?? false)
    setLocalWorkerIds(booking?.workerIds ?? [])
    setLiveTotal(booking?.final_price ?? 0)
    setLocalNeedsReview(booking?.needsReview ?? false)
  }, [booking?.id])

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

  // 날짜 변경 액션 (날짜만, 팀원 유지)
  const { execute: changeDate, isPending: datePending } = useAction(assignBookingAction, {
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 팀원 배정 액션
  const { execute: updateWorkers, isPending: workersPending } = useAction(updateBookingWorkersAction, {
    onSuccess: () => toast.success('팀원을 변경했어요!'),
    onError:   ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 취소 대상 id를 미리 잡아둔다 — 비동기 완료 시점에 booking이 바뀌어도 정확히 그 예약을 제거
  const pendingCancelId = useRef<string | null>(null)

  // 예약 취소 액션
  const { execute: cancelBooking, isPending: cancelPending } = useAction(cancelBookingFromScheduleAction, {
    onSuccess: () => {
      const id = pendingCancelId.current ?? booking?.id ?? null
      pendingCancelId.current = null
      setCancelDialogOpen(false)
      toast.success('예약이 취소됐어요')
      if (id) onCancel(id) // 보드에서 해당 카드를 '취소'로 표시
      onClose()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 취소된 예약 다시 살리기 (재예약)
  const { execute: restoreBooking, isPending: restorePending } = useAction(restoreBookingFromScheduleAction, {
    onSuccess: () => {
      if (!booking) return
      onStatusChange?.(booking.id, 'confirmed') // 보드에서 카드 즉시 복구(흐림 해제)
      toast.success('다시 예약을 잡았어요')
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

  // 검토 완료 처리 액션 (변동형 금액 확인 후 플래그 해제)
  const { execute: clearReview, isPending: clearReviewPending } = useAction(clearBookingReviewAction, {
    onSuccess: () => {
      if (!booking) return
      setLocalNeedsReview(false)
      onReviewChange?.(booking.id, false)
      toast.success('검토 완료로 표시했어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 리뷰 요청 알림톡 발송 액션
  const { execute: sendReview, isPending: reviewPending } = useAction(sendReviewRequestAction, {
    onSuccess: () => {
      setCurrentReviewSent(true)
      setReviewDialogOpen(false)
      toast.success('리뷰 요청 알림톡을 발송했어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const toggleWorker = (workerId: string) => {
    if (!booking) return
    const isSelected = localWorkerIds.includes(workerId)
    const newIds = isSelected
      ? localWorkerIds.filter((id) => id !== workerId)
      : [...localWorkerIds, workerId]

    setLocalWorkerIds(newIds)
    onWorkersChange(booking.id, newIds)
    updateWorkers({ bookingId: booking.id, workerIds: newIds })
  }

  const clearAllWorkers = () => {
    if (!booking) return
    setLocalWorkerIds([])
    onWorkersChange(booking.id, [])
    updateWorkers({ bookingId: booking.id, workerIds: [] })
  }

  const handleSaveTime = () => {
    if (!booking || !timeValue) return
    saveTime({ bookingId: booking.id, newTime: timeValue })
  }

  // 취소 버튼 → 사유 입력 다이얼로그 열기
  const handleCancelBooking = () => {
    if (!booking) return
    setCancelReason('')
    setCancelDialogOpen(true)
  }

  // 다이얼로그에서 '예약 취소 확정' → 사유와 함께 취소
  const confirmCancelBooking = () => {
    if (!booking) return
    pendingCancelId.current = booking.id
    cancelBooking({ bookingId: booking.id, reason: cancelReason.trim() || undefined })
  }

  // 날짜 변경 저장 (팀원은 유지)
  const handleSaveDate = () => {
    if (!booking || !dateValue) return
    changeDate({
      bookingId: booking.id,
      workerId:  booking.worker_id,
      newDate:   dateValue,
    })
    const currentTime = format(new Date(booking.scheduled_at), 'HH:mm:ssXXX')
    onTimeChange(booking.id, new Date(`${dateValue}T${currentTime}`).toISOString())
    setEditingDate(false)
    toast.success('날짜를 변경했어요!')
  }

  // 날짜 편집 모드 시작
  const startEditDate = () => {
    if (!booking) return
    setDateValue(format(new Date(booking.scheduled_at), 'yyyy-MM-dd'))
    setEditingDate(true)
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
  const formattedPrice = booking
    ? new Intl.NumberFormat('ko-KR').format(liveTotal) + '원'
    : ''

  return (
    <>
    <Sheet open={!!booking} onOpenChange={(isOpen: boolean) => { if (!isOpen) { setEditingTime(false); setEditingDate(false); onClose() } }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0" showCloseButton={false}>

        {/* 헤더 */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-xl leading-tight">
                {booking?.customer_name}
              </SheetTitle>
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <StatusBadge status={booking?.status ?? 'confirmed'} />
                {booking?.hasReviewHistory && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5">
                    <Star className="h-3 w-3" />
                    리뷰 작성 고객
                  </span>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* 본문 */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-5 py-2">

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
              {editingDate ? (
                <div className="space-y-2">
                  <input
                    type="date"
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {dateValue ? format(new Date(dateValue + 'T00:00:00'), 'M월 d일 (EEE)', { locale: ko }) : ''}
                    </span>
                    <button
                      onClick={handleSaveDate}
                      disabled={datePending || !dateValue}
                      className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      aria-label="저장"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingDate(false)}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                      aria-label="취소"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{scheduledDate}</span>
                  {!isCancelled && (
                    <button
                      onClick={startEditDate}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Pencil className="h-3 w-3" />
                      수정
                    </button>
                  )}
                </div>
              )}
            </Row>

            {/* 시간 */}
            <Row icon={<Clock className="h-4 w-4" />} label="예약 시간">
              {editingTime ? (
                <div className="space-y-2">
                  {/* 시 선택 */}
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 17 }, (_, i) => i + 6).map((h) => {
                      const hStr = String(h).padStart(2, '0')
                      const selected = timeValue.startsWith(hStr + ':')
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setTimeValue(`${hStr}:${timeValue.split(':')[1] ?? '00'}`)}
                          className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                            selected
                              ? 'border-primary bg-primary/10 text-primary font-semibold'
                              : 'border-border text-muted-foreground hover:border-primary/50'
                          }`}
                        >
                          {h}시
                        </button>
                      )
                    })}
                  </div>
                  {/* 분 선택 */}
                  <div className="flex gap-1">
                    {['00', '30'].map((m) => {
                      const selected = timeValue.endsWith(':' + m)
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setTimeValue(`${timeValue.split(':')[0] ?? '10'}:${m}`)}
                          className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                            selected
                              ? 'border-primary bg-primary/10 text-primary font-semibold'
                              : 'border-border text-muted-foreground hover:border-primary/50'
                          }`}
                        >
                          {m}분
                        </button>
                      )
                    })}
                  </div>
                  {/* 선택된 시간 + 저장/취소 */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-sm font-medium">{timeValue}</span>
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

            {/* 담당 팀원 — 다중 선택 */}
            <Row icon={<Users className="h-4 w-4" />} label="담당 팀원">
              {isCancelled ? (
                <span className="font-medium">
                  {localWorkerIds.length === 0
                    ? '미배정'
                    : workers.filter((w) => localWorkerIds.includes(w.id)).map((w) => w.name).join(', ')
                  }
                </span>
              ) : (
                <div className="space-y-2">
                  {workers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">등록된 직원이 없어요. 일정 탭에서 직원을 추가해주세요.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {workers.map((w) => {
                        const isSelected = localWorkerIds.includes(w.id)
                        return (
                          <button
                            key={w.id}
                            type="button"
                            disabled={workersPending}
                            onClick={() => toggleWorker(w.id)}
                            className={[
                              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all',
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-primary/40',
                            ].join(' ')}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: w.color }}
                            />
                            {w.name}
                            <span className="opacity-60">
                              {w.type === 'employee' ? '직원' : '도급사'}
                            </span>
                            {isSelected && localWorkerIds[0] === w.id && (
                              <span className="text-[9px] bg-primary/20 px-1 py-0.5 rounded">팀장</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-0.5">
                    {localWorkerIds.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAllWorkers}
                        disabled={workersPending}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        배정 취소
                      </button>
                    )}
                    {workersPending && (
                      <span className="text-xs text-muted-foreground">저장 중...</span>
                    )}
                  </div>
                </div>
              )}
            </Row>
          </div>

          {/* 취소된 예약 — 사유 표시 */}
          {booking?.status === 'cancelled' && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 mb-4">
              <p className="text-sm font-semibold text-muted-foreground">취소된 예약이에요</p>
              {booking.cancellation_reason && (
                <p className="text-sm text-foreground/80 mt-1">사유: {booking.cancellation_reason}</p>
              )}
            </div>
          )}

          {/* 서비스 정보 */}
          <div className="rounded-xl border border-border bg-card px-4 mb-4 overflow-hidden">
            {booking?.cleaning_type && (
              <Row icon={<span className="text-base">🧹</span>} label="서비스">
                <span className="font-medium">{booking.cleaning_type}</span>
              </Row>
            )}

            {booking?.service_address && (
              <MapNavButton address={booking.service_address} />
            )}

            {booking && liveTotal > 0 && (
              <Row icon={<span className="text-base">💰</span>} label="결제 금액">
                <span className="font-semibold text-foreground">{formattedPrice}</span>
              </Row>
            )}
          </div>

          {/* 금액 확인 필요 안내 — 변동형 항목(에어컨 대수·줄눈 개수 등) 포함 */}
          {booking && localNeedsReview && !isCancelled && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 mb-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <PhoneCall className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800">금액 확인이 필요한 예약이에요</p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    {booking.reviewReason ??
                      '수량·형태에 따라 금액이 달라지는 항목이 포함돼 있어요. 고객과 통화로 확인한 뒤 아래에서 금액을 맞춰주세요.'}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full h-11 gap-2 border-amber-300 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                disabled={clearReviewPending}
                onClick={() => clearReview({ id: booking.id })}
              >
                <Check className="h-4 w-4" />
                {clearReviewPending ? '처리 중...' : '통화로 확인했어요 (검토 완료)'}
              </Button>
            </div>
          )}

          {/* 항목별 견적 편집 — 통화·현장 조정 + 변경 이력 */}
          {booking && (
            <div className="mb-4">
              <BookingItemsEditor
                bookingId={booking.id}
                fallbackTotal={booking.final_price}
                onTotalChange={setLiveTotal}
              />
            </div>
          )}

          {/* 고객 상세 정보 링크 */}
          {booking?.customer_id && (
            <Link
              href={`/dashboard/clients/${booking.customer_id}`}
              className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-border hover:bg-muted transition-colors mb-4"
            >
              <div>
                <span className="text-sm font-medium">고객 상세 정보 보기</span>
                <p className="text-xs text-muted-foreground mt-0.5">이용 내역, 메모, 계약 등 전체 정보</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          )}

          {/* 클레임 — 이미 있으면 '현황 확인'(모달), 없으면 '등록'. 페이지 이동 없음 */}
          {booking && (booking.hasOpenClaim ? (
            <ClaimsStatusButton
              customerId={booking.customer_id}
              customerName={booking.customer_name}
              customerPhone={booking.customer_phone}
              bookingId={booking.id}
              onOpenClaimsChange={(hasOpen) => onClaimChange?.(booking.id, hasOpen)}
            />
          ) : (
            <AddClaimForm
              presetCustomer={{ id: booking.customer_id ?? '', name: booking.customer_name, phone: booking.customer_phone }}
              presetBookingId={booking.id}
              triggerLabel="이 작업 클레임 등록"
              triggerVariant="outline"
              triggerClassName="w-full h-12 justify-start gap-2 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 mb-4"
              onCreated={() => onClaimChange?.(booking.id, true)}
            />
          ))}

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
              <>
                {/* 작업완료 알림톡 미발송 → 보고서 페이지로 이동 */}
                {!currentReportId && (
                  <Link href={`/dashboard/bookings/${booking?.id}/report`}>
                    <Button
                      className="w-full h-12 font-semibold gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                      <Send className="h-4 w-4" />
                      작업 보고서 작성 · 발송
                    </Button>
                  </Link>
                )}

                {/* 알림톡 발송 완료 → 리뷰 요청 확인창 열기 */}
                {currentReportId && !currentReviewSent && (
                  <>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium px-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      작업 보고서 발송됨
                    </div>
                    <Button
                      variant="outline"
                      className="w-full h-12 font-semibold gap-2"
                      onClick={() => setReviewDialogOpen(true)}
                    >
                      <Star className="h-4 w-4" />
                      리뷰 요청 발송
                    </Button>
                  </>
                )}

                {/* 리뷰 요청까지 완료 */}
                {currentReportId && currentReviewSent && (
                  <div className="flex items-center justify-center gap-1.5 text-sm text-emerald-600 font-medium py-3">
                    <CheckCircle2 className="h-4 w-4" />
                    작업 보고서 · 리뷰 요청 모두 발송 완료
                  </div>
                )}

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
              </>
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

        {/* 취소·노쇼 예약 — 다시 예약 잡기 (고객 재예약 대비) */}
        {isCancelled && booking && (
          <div className="px-5 pb-5 pt-3 border-t border-border">
            <Button
              className="w-full h-12 font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700"
              disabled={restorePending}
              onClick={() => restoreBooking({ bookingId: booking.id })}
            >
              {restorePending ? '처리 중...' : '다시 예약 잡기'}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              이 고객이 다시 예약하면 눌러서 일정에 되살릴 수 있어요
            </p>
          </div>
        )}

      </SheetContent>
    </Sheet>

    {/* 리뷰 요청 알림톡 발송 확인 Dialog */}
    <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>리뷰 요청 알림톡 발송</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            아래 고객에게 리뷰 요청 알림톡을 발송할까요?
          </p>
          <div className="rounded-xl bg-muted/50 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-16 shrink-0">받는 분</span>
              <span className="text-sm font-semibold">{booking?.customer_name}</span>
            </div>
            {booking?.customer_phone && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">연락처</span>
                <span className="text-sm flex items-center gap-1">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  {booking.customer_phone}
                </span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground w-16 shrink-0 pt-0.5">내용</span>
              <span className="text-sm text-muted-foreground leading-relaxed">
                네이버 플레이스 리뷰 작성 링크가 전달돼요
              </span>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setReviewDialogOpen(false)}>
            취소
          </Button>
          <Button
            className="flex-1 gap-1.5"
            disabled={reviewPending}
            onClick={() => {
              if (!currentReportId) return
              sendReview({ reportId: currentReportId })
            }}
          >
            <Star className="h-3.5 w-3.5" />
            {reviewPending ? '발송 중...' : '리뷰 요청 발송'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 예약 취소 — 사유 입력 Dialog */}
    <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>예약 취소</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            취소 후에는 되돌릴 수 없어요. 사유를 남기면 <span className="font-medium text-foreground">고객 이력</span>에 함께 남아 나중에 참고할 수 있어요.
          </p>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="취소 사유 (선택) — 예: 고객 일정 변경, 단순 변심, 현장 사정"
            className="w-full min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setCancelDialogOpen(false)}>
            닫기
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            disabled={cancelPending}
            onClick={confirmCancelBooking}
          >
            {cancelPending ? '취소 중...' : '예약 취소 확정'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
