'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  fieldStartWorkAction,
  fieldSaveMemoAction,
  fieldCompletePaymentAction,
  fieldRequestPaymentAction,
} from '@/lib/actions/field'
import {
  ArrowLeft,
  MapPin,
  Phone,
  Clock,
  Banknote,
  Camera,
  FileText,
  CheckCircle2,
  CircleDollarSign,
  Receipt,
  Play,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface BookingData {
  id: string
  customerName: string
  customerPhone: string | null
  serviceAddress: string | null
  scheduledAt: string
  finalPrice: number
  status: string
  memo: string | null
}

interface Props {
  workerId: string
  workerName: string
  booking: BookingData
  reportId: string | null
  reportSentAt: string | null
}

export function FieldBookingClient({ workerId, workerName, booking, reportId, reportSentAt }: Props) {
  const [currentStatus, setCurrentStatus] = useState(booking.status)
  const [siteMemo, setSiteMemo] = useState(booking.memo ?? '')
  const [customerRequest, setCustomerRequest] = useState('')
  const [nextVisitNote, setNextVisitNote] = useState('')
  const [memoOpen, setMemoOpen] = useState(false)
  const [memoSaved, setMemoSaved] = useState(false)
  const [receiptSent, setReceiptSent] = useState(false)

  // 작업 시작
  const { execute: startWork, isPending: isStarting } = useAction(fieldStartWorkAction, {
    onSuccess: () => {
      setCurrentStatus('in_progress')
      toast.success('작업을 시작했어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 메모 저장
  const { execute: saveMemo, isPending: isSavingMemo } = useAction(fieldSaveMemoAction, {
    onSuccess: () => {
      setMemoSaved(true)
      toast.success('메모가 저장됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 수금 완료
  const { execute: completePayment, isPending: isCompleting } = useAction(fieldCompletePaymentAction, {
    onSuccess: () => {
      setCurrentStatus('completed')
      toast.success('수금 완료!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 영수증 발송 (선택)
  const { execute: sendReceipt, isPending: isSendingReceipt } = useAction(fieldRequestPaymentAction, {
    onSuccess: () => {
      setReceiptSent(true)
      toast.success('영수증이 고객에게 발송됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 시간 포맷
  const time = new Date(booking.scheduledAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })

  const date = new Date(booking.scheduledAt).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  })

  const statusLabel: Record<string, string> = {
    confirmed:   '예정',
    in_progress: '작업 중',
    completed:   '완료',
  }

  const statusColor: Record<string, string> = {
    confirmed:   'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed:   'bg-emerald-100 text-emerald-700',
  }

  return (
    <div className="min-h-dvh bg-gray-50 pb-32">
      {/* 헤더 */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
        <Link href={`/field/${workerId}`} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold">작업 상세</h1>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[currentStatus] ?? 'bg-gray-100'}`}>
          {statusLabel[currentStatus] ?? currentStatus}
        </span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 고객 정보 카드 */}
        <div className="rounded-xl bg-white border p-4 space-y-3">
          <h2 className="font-semibold text-lg">{booking.customerName}</h2>

          <div className="space-y-2">
            {booking.customerPhone && (
              <a
                href={`tel:${booking.customerPhone}`}
                className="flex items-center gap-2.5 text-sm text-primary"
              >
                <Phone className="h-4 w-4" />
                <span>{booking.customerPhone}</span>
              </a>
            )}

            {booking.serviceAddress && (
              <a
                href={`https://map.naver.com/v5/search/${encodeURIComponent(booking.serviceAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 text-sm text-primary"
              >
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{booking.serviceAddress}</span>
              </a>
            )}

            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{date} {time}</span>
            </div>

            <div className="flex items-center gap-2.5 text-sm font-medium">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              <span>{booking.finalPrice.toLocaleString('ko-KR')}원</span>
            </div>
          </div>
        </div>

        {/* 메모 섹션 — 작업 중이거나 완료 전 */}
        {(currentStatus === 'in_progress' || currentStatus === 'confirmed') && (
          <div className="rounded-xl bg-white border overflow-hidden">
            <button
              type="button"
              onClick={() => setMemoOpen(!memoOpen)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>현장 메모 작성</span>
                {memoSaved && <span className="text-xs text-emerald-600">(저장됨)</span>}
              </div>
              {memoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {memoOpen && (
              <div className="px-4 pb-4 space-y-4 border-t pt-3">
                {/* 현장 특이사항 */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    현장 특이사항
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    작업 전 파손·오염 등 기록 (책임 분리용)
                  </p>
                  <Textarea
                    placeholder="예: 거실 창문 틀에 기존 흠집 있음"
                    value={siteMemo}
                    onChange={(e) => { setSiteMemo(e.target.value); setMemoSaved(false) }}
                    rows={2}
                  />
                </div>

                {/* 고객 추가 요청 */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    고객 추가 요청사항
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    현장에서 고객이 추가로 요청한 내용
                  </p>
                  <Textarea
                    placeholder="예: 베란다 창틀도 닦아달라고 요청"
                    value={customerRequest}
                    onChange={(e) => { setCustomerRequest(e.target.value); setMemoSaved(false) }}
                    rows={2}
                  />
                </div>

                {/* 다음 방문 참고 */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    다음 방문 시 참고
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    다음에 올 직원이 알아야 할 내용 (고객 DB에 자동 저장)
                  </p>
                  <Textarea
                    placeholder="예: 현관 비밀번호 1234#, 반려동물 있음"
                    value={nextVisitNote}
                    onChange={(e) => { setNextVisitNote(e.target.value); setMemoSaved(false) }}
                    rows={2}
                  />
                </div>

                <Button
                  variant="outline"
                  className="w-full h-11"
                  disabled={isSavingMemo}
                  onClick={() =>
                    saveMemo({
                      workerId,
                      bookingId: booking.id,
                      siteMemo: siteMemo || undefined,
                      customerRequest: customerRequest || undefined,
                      nextVisitNote: nextVisitNote || undefined,
                    })
                  }
                >
                  {isSavingMemo ? '저장 중...' : '메모 저장하기'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 보고서 바로가기 — 작업 중 이상일 때 */}
        {(currentStatus === 'in_progress' || currentStatus === 'completed') && (
          <Link
            href={`/field/${workerId}/${booking.id}/report`}
            className="flex items-center gap-3 rounded-xl bg-white border p-4 hover:border-primary/30 transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Camera className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">작업 완료 보고서</p>
              <p className="text-xs text-muted-foreground">
                {reportId
                  ? reportSentAt
                    ? '보고서 발송 완료'
                    : '보고서 작성됨 · 발송 대기 중'
                  : 'Before/After 사진을 올려주세요'
                }
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
          </Link>
        )}

        {/* 완료 상태 안내 */}
        {currentStatus === 'completed' && (
          <div className="space-y-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="font-medium text-emerald-800">수금 완료</p>
              </div>
              <p className="text-xs text-emerald-700 ml-7">
                리뷰 요청이 고객에게 자동 발송됐어요
              </p>
            </div>

            {/* 영수증 발송 (선택) */}
            {booking.customerPhone && (
              <div className="rounded-xl bg-white border p-4 space-y-2">
                {receiptSent ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>영수증이 발송됐어요</span>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">고객에게 영수증을 보내시겠어요?</p>
                    <Button
                      variant="outline"
                      className="w-full h-11 gap-2"
                      disabled={isSendingReceipt}
                      onClick={() => sendReceipt({ workerId, bookingId: booking.id })}
                    >
                      <Receipt className="h-4 w-4" />
                      {isSendingReceipt ? '발송 중...' : '영수증 보내기'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 고정 액션 버튼 */}
      {currentStatus !== 'completed' && currentStatus !== 'cancelled' && currentStatus !== 'no_show' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 pb-safe">
          {currentStatus === 'confirmed' && (
            <Button
              size="lg"
              className="w-full h-14 text-base gap-2"
              disabled={isStarting}
              onClick={() => startWork({ workerId, bookingId: booking.id })}
            >
              <Play className="h-5 w-5" />
              {isStarting ? '처리 중...' : '작업 시작하기'}
            </Button>
          )}

          {currentStatus === 'in_progress' && (
            <Button
              size="lg"
              className="w-full h-14 text-base gap-2 bg-emerald-600 hover:bg-emerald-700"
              disabled={isCompleting}
              onClick={() => {
                if (confirm(`${booking.finalPrice.toLocaleString()}원 수금 완료할까요?`)) {
                  completePayment({ workerId, bookingId: booking.id })
                }
              }}
            >
              <CircleDollarSign className="h-5 w-5" />
              {isCompleting ? '처리 중...' : `수금 완료 · ${booking.finalPrice.toLocaleString()}원`}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
