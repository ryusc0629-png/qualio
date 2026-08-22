'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import Link from 'next/link'
import {
  Phone, Clock, User, ChevronRight,
  Pencil, Check, X, CalendarDays, CheckCircle2, Send, Star, Users, PhoneCall, Trash2,
  MessageCircle,
} from 'lucide-react'
import { formatDateTime } from '@/lib/format/datetime'
import { MapNavButton } from '@/components/dashboard/map-nav-button'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import { BookingItemsEditor } from '@/components/dashboard/booking-items-editor'
import { AddClaimForm } from '@/components/dashboard/add-claim-form'
import { ClaimsStatusButton } from '@/components/dashboard/claims-status-button'
import { SendReceiptButton } from '@/components/dashboard/send-receipt-button'
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
  deleteBookingFromScheduleAction,
  updateBookingStatusAction,
} from '@/lib/actions/workers'
import { clearBookingReviewAction, sendOnMyWayAction } from '@/lib/actions/bookings'
import { sendReviewRequestAction } from '@/lib/actions/reports'

// ── 타입 ──────────────────────────────────────────────────

interface Worker {
  id: string
  name: string
  type: string
  color: string
  phone: string | null
}

/**
 * 고객에게 나간 카카오 알림톡의 발송 시각 모음.
 * 값이 있으면 '보냄', 없으면 아직 안 나간 것 — 사장님 화면에서 둘 다 보여준다.
 */
export interface AlimtalkSentAt {
  confirm:    string | null // 예약 확정 안내
  reminder:   string | null // 방문 전날 안내
  onMyWay:    string | null // 곧 도착해요
  report:     string | null // 작업 보고서
  review:     string | null // 후기 요청
  receipt:    string | null // 영수증
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
  contract_id?: string | null // 정기계약 소속이면 계약 id — 시간 일괄 변경에 사용
  reportId?: string | null
  reviewSent?: boolean
  hasReviewHistory?: boolean
  hasOpenClaim?: boolean
  needsReview?: boolean
  reviewReason?: string | null
  cancellation_reason?: string | null
  alimtalk?: AlimtalkSentAt
}

interface Props {
  booking: Booking | null
  businessId: string
  workers: Worker[]
  onClose: () => void
  onWorkersChange: (bookingId: string, newWorkerIds: string[]) => void
  // propagate가 있으면 같은 정기계약의 앞으로의 방문 시각도 함께 갱신하라는 뜻
  onTimeChange:    (bookingId: string, newScheduledAt: string, propagate?: { contractId: string; newTime: string }) => void
  onCancel:        (bookingId: string) => void
  // 잘못 넣은 일정 삭제 — 보드에서 카드를 완전히 제거
  onDelete?:       (bookingId: string) => void
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

// ── 고객에게 보낸 카톡 ───────────────────────────────────
//
// 사장님이 가장 자주 묻는 것: "고객한테 카톡이 나갔나요?"
// 지금까지는 이걸 확인할 화면이 한 곳도 없어서, 나가고도 안 나간 줄 알거나
// 직접 고객에게 전화해 물어보는 일이 생겼다. 예약 상세에 항상 보이게 둔다.
//
// 아직 안 나간 것도 '언제 나갈지'를 함께 적는다 — 그래야 기다리면 되는 건지
// 내가 눌러야 하는 건지 사장님이 스스로 판단할 수 있다.

/** 알림톡 한 줄이 지금 어떤 상태인지 */
type AlimtalkRow = {
  label: string
  sentAt: string | null
  /** 아직 안 나갔을 때 보여줄 안내 — 자동 발송이면 언제 나가는지, 수동이면 무엇을 눌러야 하는지 */
  pending: string
  /** 이 예약에선 아예 해당 없는 항목이면 목록에서 뺀다 (예: 취소된 예약의 후기 요청) */
  hide?: boolean
}

function AlimtalkHistory({ booking }: { booking: Booking }) {
  const a = booking.alimtalk
  if (!a) return null

  const isCancelled = booking.status === 'cancelled'
  const isDone      = booking.status === 'completed'
  // 정기계약 방문이면 방문 단위 카톡을 보내지 않는다 — 목록에서 아예 빼서
  // "왜 안 보냈지?" 하고 사장님이 헷갈리지 않게 한다.
  const isRecurring = !!booking.contract_id

  const rows: AlimtalkRow[] = [
    {
      label: '예약 확정 안내',
      sentAt: a.confirm,
      pending: '예약을 확정하면 바로 나가요',
      hide: isRecurring,
    },
    {
      label: '방문 전날 안내',
      sentAt: a.reminder,
      pending: isCancelled
        ? '취소된 예약이라 안 나가요'
        : isRecurring
          ? '계약에서 켜면 방문 하루 전 오전 10시에 나가요'
          : '방문 하루 전 오전 10시에 자동으로 나가요',
    },
    {
      label: '곧 도착해요',
      sentAt: a.onMyWay,
      pending: '방문 당일 출발할 때 직접 눌러서 보내요',
      hide: isCancelled || isRecurring,
    },
    {
      label: '작업 보고서',
      sentAt: a.report,
      pending: isDone ? '보고서를 작성해서 보내면 기록돼요' : '작업이 끝난 뒤에 보내요',
      hide: isCancelled || isRecurring,
    },
    {
      label: '후기 요청',
      sentAt: a.review,
      pending: '보고서를 보낸 뒤에 보낼 수 있어요',
      hide: isCancelled || isRecurring,
    },
    {
      label: '영수증',
      sentAt: a.receipt,
      // 영수증은 자동 발송 대상이 아니다 — 보낸 적이 있을 때만 목록에 남긴다.
      // 안 보낸 예약마다 '아직 안 나감'으로 뜨면 빠뜨린 일처럼 보인다.
      pending: '',
      hide: isCancelled || isRecurring || !a.receipt,
    },
  ]

  const visible = rows.filter((r) => !r.hide)
  const sentCount = visible.filter((r) => r.sentAt).length

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-sm font-semibold">고객에게 보낸 카톡</p>
        <span className="text-[11px] text-muted-foreground ml-auto">{sentCount}건 발송</span>
      </div>

      <ul className="space-y-1.5">
        {visible.map((r) => (
          <li key={r.label} className="flex items-start gap-2 text-sm">
            {r.sentAt ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className={r.sentAt ? 'font-medium' : 'text-muted-foreground'}>{r.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {r.sentAt
                  ? `${formatDateTime(r.sentAt, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}에 보냄`
                  : r.pending}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-muted-foreground mt-2.5 pt-2.5 border-t border-border">
        {isRecurring
          ? '정기 거래처엔 방문마다 보내지 않아요. 첫 작업 리포트와 월간 보고서로 안내해요.'
          : '고객 카카오톡으로 발송돼요. 고객이 카카오톡을 쓰지 않으면 도착하지 않을 수 있어요.'}
      </p>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────

export function BookingDetailSheet({
  booking,
  businessId,
  workers,
  onClose,
  onWorkersChange,
  onTimeChange,
  onCancel,
  onDelete,
  onStatusChange,
  onClaimChange,
  onReviewChange,
}: Props) {
  const [editingTime, setEditingTime] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue]     = useState('')
  const [timeValue, setTimeValue]     = useState('')
  // 정기계약 소속 예약일 때, 시간 변경을 계약 전체(앞으로의 모든 방문)에 적용할지
  const [applyToContract, setApplyToContract] = useState(true)
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
  // 기사 출발 알림 발송 여부
  const [onMyWaySent, setOnMyWaySent]             = useState(false)
  // 이 시트에서 방금 영수증을 다시 보냈는지 — 새로고침 없이 버튼을 감추기 위해서
  const [receiptSentLocally, setReceiptSentLocally] = useState(false)

  // booking이 바뀔 때마다 상태 초기화
  useEffect(() => {
    setCurrentReportId(booking?.reportId ?? null)
    setCurrentReviewSent(booking?.reviewSent ?? false)
    setLocalWorkerIds(booking?.workerIds ?? [])
    setLiveTotal(booking?.final_price ?? 0)
    setLocalNeedsReview(booking?.needsReview ?? false)
    setOnMyWaySent(false)
    setReceiptSentLocally(false)
  }, [booking?.id])

  // 언마운트 시 대기 중인 팀원 저장 타이머 정리
  useEffect(() => {
    return () => {
      if (workersSaveTimer.current) clearTimeout(workersSaveTimer.current)
    }
  }, [])

  const isCancelled = !booking ||
    ['cancelled', 'no_show'].includes(booking.status)

  // 정기계약 방문 — 거래처에 나가는 카톡은 방문 전날 안내(계약에서 켠 경우)·초도 보고서·
  // 월간 보고서 세 가지뿐이라, 방문 단위 발송 버튼은 아예 보여주지 않는다.
  const isRecurringVisit = !!booking?.contract_id

  // 영수증이 나간 시각 — 이 시트에서 방금 보낸 것도 즉시 반영한다
  const receiptSentAt = booking?.alimtalk?.receipt
    ?? (receiptSentLocally ? new Date().toISOString() : null)

  // 시간 변경 액션
  const { execute: saveTime, isPending: timePending } = useAction(updateBookingTimeAction, {
    onSuccess: ({ data }) => {
      if (!booking || !data?.newScheduledAt) return
      const propagated = data.propagated ?? 0
      onTimeChange(
        booking.id,
        data.newScheduledAt,
        propagated > 0 && data.contractId
          ? { contractId: data.contractId, newTime: timeValue }
          : undefined,
      )
      setEditingTime(false)
      toast.success(
        propagated > 0
          ? `이 시간으로 앞으로 ${propagated}개 방문을 바꿨어요!`
          : '시간을 변경했어요!',
      )
    },
    // 못 바꾸는 이유(같은 거래처 일정이 이미 있는 등)는 문장이 길어 기본 4초로는 다 못 읽는다
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요', { duration: 8000 }),
  })

  // 날짜 변경 액션 (날짜만, 팀원 유지)
  const { execute: changeDate, isPending: datePending } = useAction(assignBookingAction, {
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요', { duration: 8000 }),
  })

  // 팀원 배정 액션
  const { execute: updateWorkers, isPending: workersPending } = useAction(updateBookingWorkersAction, {
    onSuccess: () => toast.success('팀원을 변경했어요!'),
    onError:   ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 취소 대상 id를 미리 잡아둔다 — 비동기 완료 시점에 booking이 바뀌어도 정확히 그 예약을 제거
  const pendingCancelId = useRef<string | null>(null)

  // 팀원 배정 저장 디바운스 — 빠르게 여러 명을 눌러도 서버엔 마지막 상태 1번만 전송
  const workersSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // 잘못 넣은 일정 삭제 액션 — 비동기 완료 시점에 booking이 바뀌어도 정확히 그 예약을 제거
  const pendingDeleteId = useRef<string | null>(null)
  const { execute: deleteBooking, isPending: deletePending } = useAction(deleteBookingFromScheduleAction, {
    onSuccess: () => {
      const id = pendingDeleteId.current ?? booking?.id ?? null
      pendingDeleteId.current = null
      toast.success('일정을 삭제했어요')
      if (id) onDelete?.(id) // 보드에서 카드 완전히 제거
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

  // 기사 출발 알림 발송 액션
  const { execute: sendOnMyWay, isPending: onMyWayPending } = useAction(sendOnMyWayAction, {
    onSuccess: ({ data }) => {
      if (data?.skipped) {
        toast.info('이 고객은 출발 알림을 꺼두셨어요')
      } else if (data?.sent) {
        setOnMyWaySent(true)
        toast.success('고객에게 출발 알림을 보냈어요!')
      } else {
        toast.info('출발 알림은 준비 중이에요 (곧 사용 가능)')
      }
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

  // 화면은 즉시 바꾸고(로컬 상태), 서버 저장만 디바운스로 묶는다 — 여러 명을 빠르게 눌러도 자유롭게 클릭 가능
  const queueWorkersSave = (bookingId: string, newIds: string[]) => {
    if (workersSaveTimer.current) clearTimeout(workersSaveTimer.current)
    // 위 언마운트 정리 effect가 이 타이머를 읽는다는 이유로 규칙이 수정을 막지만,
    // 타이머 보관은 useRef의 본래 용도이고 화면 그리기와 무관하다(클릭했을 때만 실행).
    // eslint-disable-next-line react-hooks/immutability
    workersSaveTimer.current = setTimeout(() => {
      updateWorkers({ bookingId, workerIds: newIds })
    }, 600)
  }

  const toggleWorker = (workerId: string) => {
    if (!booking) return
    const isSelected = localWorkerIds.includes(workerId)
    const newIds = isSelected
      ? localWorkerIds.filter((id) => id !== workerId)
      : [...localWorkerIds, workerId]

    setLocalWorkerIds(newIds)
    onWorkersChange(booking.id, newIds)
    queueWorkersSave(booking.id, newIds)
  }

  const clearAllWorkers = () => {
    if (!booking) return
    setLocalWorkerIds([])
    onWorkersChange(booking.id, [])
    queueWorkersSave(booking.id, [])
  }

  // 시트 닫기 — 편집 중이던 상태를 정리하고 부모에 알림 (헤더 닫기 버튼 · 바깥 클릭 공통)
  const handleClose = () => {
    setEditingTime(false)
    setEditingDate(false)
    onClose()
  }

  const handleSaveTime = () => {
    if (!booking || !timeValue) return
    saveTime({
      bookingId: booking.id,
      newTime: timeValue,
      applyToContract: Boolean(booking.contract_id) && applyToContract,
    })
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

  // 잘못 넣은 일정 삭제 — 되돌릴 수 없어 확인 후 진행
  const handleDeleteBooking = () => {
    if (!booking) return
    if (!confirm('이 일정을 완전히 삭제할까요?\n삭제하면 되돌릴 수 없어요.')) return
    pendingDeleteId.current = booking.id
    deleteBooking({ bookingId: booking.id })
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
    setApplyToContract(true) // 정기계약이면 기본으로 전체 적용을 켜둔다
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
    <Sheet open={!!booking} onOpenChange={(isOpen: boolean) => { if (!isOpen) handleClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0" showCloseButton={false}>

        {/* 헤더 */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
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
            {/* 닫기(뒤로) 버튼 — 모바일은 시트가 전체 화면을 덮어 바깥 탭이 불가하므로 필수 */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="닫기"
              className="-mr-1 shrink-0 flex items-center justify-center h-11 w-11 rounded-full text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
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
                  {/* 정기계약이면 — 앞으로의 모든 방문에 함께 적용할지 */}
                  {booking?.contract_id && (
                    <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={applyToContract}
                        onChange={(e) => setApplyToContract(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-primary shrink-0"
                      />
                      <span className="text-xs text-muted-foreground leading-snug">
                        이 정기계약의 <span className="font-medium text-foreground">앞으로 모든 방문</span>도 이 시간으로 바꾸기
                        <br />
                        <span className="text-[11px]">(이미 지난 방문·완료된 방문은 그대로 둬요)</span>
                      </span>
                    </label>
                  )}
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

          {/* 고객에게 나간 카톡 — "보냈나?"를 여기서 바로 확인 */}
          {booking && (
            <div className="mb-4">
              <AlimtalkHistory
                booking={{
                  ...booking,
                  alimtalk: booking.alimtalk && {
                    ...booking.alimtalk,
                    // 이 시트에서 방금 보낸 건 새로고침 없이 즉시 반영한다
                    onMyWay: booking.alimtalk.onMyWay ?? (onMyWaySent ? new Date().toISOString() : null),
                    review:  booking.alimtalk.review  ?? (currentReviewSent ? new Date().toISOString() : null),
                    receipt: receiptSentAt,
                  },
                }}
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
            {/* 정기 거래처엔 방문마다 카톡을 보내지 않는다 — 왜 버튼이 없는지 한 줄로 설명 */}
            {isRecurringVisit && ['confirmed', 'in_progress', 'completed'].includes(booking?.status ?? '') && (
              <p className="text-xs text-muted-foreground text-center py-1.5">
                정기 거래처라 방문마다 카톡을 보내지 않아요 · 월간 보고서로 한 번에 안내해요
              </p>
            )}
            {/* 기사 출발 알림 — 방문 전(확정/진행) + 연락처 있을 때. 정기 방문은 제외 */}
            {booking && !isRecurringVisit && booking.customer_phone && ['confirmed', 'in_progress'].includes(booking.status) && (
              onMyWaySent ? (
                <div className="flex items-center justify-center gap-1.5 text-sm text-emerald-600 font-medium py-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  출발 알림을 보냈어요
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-12 font-semibold gap-2"
                  disabled={onMyWayPending}
                  onClick={() => sendOnMyWay({ id: booking.id })}
                >
                  <Send className="h-4 w-4" />
                  {onMyWayPending ? '보내는 중...' : '기사 출발 알림 보내기'}
                </Button>
              )
            )}
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
                {/* 작업완료 알림톡 미발송 → 보고서 페이지로 이동. 정기 방문은 보고서·리뷰 요청을 보내지 않는다 */}
                {!isRecurringVisit && !currentReportId && (
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
                {!isRecurringVisit && currentReportId && !currentReviewSent && (
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

                {/* 영수증은 자동으로 안 나간다 — 고객이 달라고 할 때만 여기서 보낸다.
                    한 번 보내고 나면 위 '고객에게 보낸 카톡'에 기록으로 남고 이 버튼은 사라진다. */}
                {!isRecurringVisit && !receiptSentAt && booking.customer_phone && (
                  <SendReceiptButton
                    bookingId={booking.id}
                    businessId={businessId}
                    customerPhone={booking.customer_phone}
                    onSent={() => setReceiptSentLocally(true)}
                  />
                )}

                {/* 리뷰 요청까지 완료 */}
                {!isRecurringVisit && currentReportId && currentReviewSent && (
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
                disabled={cancelPending || deletePending}
                onClick={handleCancelBooking}
              >
                {cancelPending ? '취소 중...' : '예약 취소하기'}
              </Button>
            )}
            {/* 잘못 넣은 일정 삭제 — 취소(이력 남김)와 달리 목록에서 아예 제거 */}
            <Button
              variant="ghost"
              className="w-full h-11 gap-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive font-medium"
              disabled={deletePending || cancelPending}
              onClick={handleDeleteBooking}
            >
              <Trash2 className="h-4 w-4" />
              {deletePending ? '삭제 중...' : '잘못 넣은 일정이에요 · 삭제하기'}
            </Button>
          </div>
        )}

        {/* 취소·노쇼 예약 — 다시 예약 잡기 (고객 재예약 대비) + 잘못 넣은 일정 삭제 */}
        {isCancelled && booking && (
          <div className="px-5 pb-5 pt-3 border-t border-border">
            <Button
              className="w-full h-12 font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700"
              disabled={restorePending || deletePending}
              onClick={() => restoreBooking({ bookingId: booking.id })}
            >
              {restorePending ? '처리 중...' : '다시 예약 잡기'}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              이 고객이 다시 예약하면 눌러서 일정에 되살릴 수 있어요
            </p>
            <Button
              variant="ghost"
              className="w-full h-11 mt-2 gap-2 text-destructive hover:bg-destructive/5 hover:text-destructive font-semibold"
              disabled={deletePending || restorePending}
              onClick={handleDeleteBooking}
            >
              <Trash2 className="h-4 w-4" />
              {deletePending ? '삭제 중...' : '잘못 넣은 일정이에요 · 삭제하기'}
            </Button>
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
