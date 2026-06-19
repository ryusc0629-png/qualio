'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import {
  fieldStartWorkAction,
  fieldSaveMemoAction,
  fieldSaveBeforePhotosAction,
  fieldCompletePaymentAction,
  fieldRequestPaymentAction,
} from '@/lib/actions/field'
import { FieldBookingItemsEditor } from '@/components/field/field-booking-items-editor'
import { ContactActions } from '@/components/dashboard/contact-actions'
import {
  ArrowLeft,
  Clock,
  Banknote,
  Camera,
  FileText,
  CheckCircle2,
  CircleDollarSign,
  Play,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  Film,
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

type PhotoSlot = { url: string; uploading: boolean }

interface Props {
  workerId: string
  workerName: string
  businessId: string
  booking: BookingData
  reportId: string | null
  reportSentAt: string | null
  existingBeforeUrls: string[]
  existingCustomerRequest: string
  existingNextVisitNote: string
  memoUpdatedById: string | null
  memoUpdatedByName: string | null
  memoUpdatedAt: string | null
}

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

export function FieldBookingClient({ workerId, workerName, businessId, booking, reportId, reportSentAt, existingBeforeUrls, existingCustomerRequest, existingNextVisitNote, memoUpdatedById, memoUpdatedByName, memoUpdatedAt }: Props) {
  const [currentStatus, setCurrentStatus] = useState(booking.status)
  // 현장에서 항목을 조정하면 결제 금액도 실시간으로 따라간다
  const [liveTotal, setLiveTotal] = useState(booking.finalPrice)
  const [siteMemo, setSiteMemo] = useState(booking.memo ?? '')
  const [customerRequest, setCustomerRequest] = useState(existingCustomerRequest)
  const [nextVisitNote, setNextVisitNote] = useState(existingNextVisitNote)
  const [memoOpen, setMemoOpen] = useState(false)
  const [memoSaved, setMemoSaved] = useState(false)
  const [lastSavedById, setLastSavedById] = useState(memoUpdatedById)
  const [lastSavedByName, setLastSavedByName] = useState(memoUpdatedByName)
  const [lastSavedAt, setLastSavedAt] = useState(memoUpdatedAt)
  const [paymentRequested, setPaymentRequested] = useState(false)
  const [beforePhotos, setBeforePhotos] = useState<PhotoSlot[]>(
    existingBeforeUrls.map((url) => ({ url, uploading: false }))
  )
  const beforeInputRef = useRef<HTMLInputElement>(null)

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
      setLastSavedById(workerId)
      setLastSavedByName(workerName)
      setLastSavedAt(new Date().toISOString())
      toast.success('메모가 저장됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 수금 완료
  const { execute: completePayment, isPending: isCompleting } = useAction(fieldCompletePaymentAction, {
    onSuccess: ({ data }) => {
      setCurrentStatus('completed')
      if (data?.reviewSkipped) {
        toast.success('수금 완료! (리뷰 요청 미발송)')
      } else {
        toast.success('수금 완료!')
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 결제 요청 (고객에게 알림톡 발송)
  const { execute: requestPayment, isPending: isRequestingPayment } = useAction(fieldRequestPaymentAction, {
    onSuccess: () => {
      setPaymentRequested(true)
      toast.success('고객에게 결제 요청을 보냈어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 작업 전 사진 저장
  const { execute: saveBeforePhotos, isPending: isSavingPhotos } = useAction(fieldSaveBeforePhotosAction, {
    onSuccess: () => toast.success('현장 사진이 저장됐어요!'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 사진 업로드
  const handleBeforePhotoUpload = async (files: FileList) => {
    const remaining = 5 - beforePhotos.length
    if (remaining <= 0) {
      toast.error('사진은 최대 5장까지 등록할 수 있어요')
      return
    }
    const toUpload = Array.from(files).slice(0, remaining)
    const placeholders = toUpload.map(() => ({ url: '', uploading: true }))
    setBeforePhotos((prev) => [...prev, ...placeholders])

    const supabase = createClient()
    const uploaded: string[] = []

    for (const file of toUpload) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${businessId}/${booking.id}/before/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('report-photos').upload(path, file, { upsert: true })
      if (error) {
        toast.error('사진 업로드에 실패했어요')
        continue
      }
      const { data: { publicUrl } } = supabase.storage.from('report-photos').getPublicUrl(path)
      uploaded.push(publicUrl)
    }

    setBeforePhotos((prev) => {
      const result = [...prev.filter((p) => !p.uploading)]
      uploaded.forEach((url) => result.push({ url, uploading: false }))
      return result
    })

    // 업로드 완료 후 자동 저장
    const allUrls = [
      ...beforePhotos.filter((p) => !p.uploading && p.url).map((p) => p.url),
      ...uploaded,
    ]
    if (allUrls.length > 0) {
      saveBeforePhotos({ workerId, bookingId: booking.id, beforePhotoUrls: allUrls })
    }
  }

  const removeBeforePhoto = (url: string) => {
    const updated = beforePhotos.filter((p) => p.url !== url)
    setBeforePhotos(updated)
    // 삭제 후 자동 저장
    saveBeforePhotos({
      workerId,
      bookingId: booking.id,
      beforePhotoUrls: updated.filter((p) => p.url).map((p) => p.url),
    })
  }

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
            {/* 전화·문자·길찾기(카카오/네이버/티맵) 바로가기 */}
            <ContactActions phone={booking.customerPhone} address={booking.serviceAddress} />

            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{date} {time}</span>
            </div>

            <div className="flex items-center gap-2.5 text-sm font-medium">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              <span>{liveTotal.toLocaleString('ko-KR')}원</span>
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
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>현장 메모 작성</span>
                {memoSaved && <span className="text-xs text-emerald-600">(저장됨)</span>}
                {lastSavedByName && lastSavedAt && !memoSaved && (
                  <span className="text-xs text-muted-foreground">
                    마지막 저장: {lastSavedByName} · {relativeTime(lastSavedAt)}
                  </span>
                )}
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

                  {/* 작업 전 현장 사진 */}
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      현장 사진을 찍어두면 보고서에 자동으로 올라가요
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {beforePhotos.map((photo) => (
                        <div key={photo.url || 'uploading'} className="relative w-20 h-20 rounded-lg overflow-hidden border bg-muted">
                          {photo.uploading ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photo.url} alt="현장 사진" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeBeforePhoto(photo.url)}
                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                              >
                                <X className="h-3 w-3 text-white" />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                      {beforePhotos.length < 5 && (
                        <button
                          type="button"
                          onClick={() => beforeInputRef.current?.click()}
                          className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 transition-colors"
                        >
                          <Camera className="h-5 w-5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">사진 추가</span>
                        </button>
                      )}
                    </div>
                    <input
                      ref={beforeInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) handleBeforePhotoUpload(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </div>
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

                {lastSavedByName && lastSavedAt && lastSavedById !== workerId && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
                    <span className="font-semibold">{lastSavedByName}</span>님이 {relativeTime(lastSavedAt)} 저장했어요.
                    저장하면 그 내용을 덮어씁니다.
                  </div>
                )}
                <Button
                  variant="outline"
                  className="w-full h-11"
                  disabled={isSavingMemo}
                  onClick={() => {
                    const doSave = () => saveMemo({
                      workerId,
                      bookingId: booking.id,
                      siteMemo: siteMemo || undefined,
                      customerRequest: customerRequest || undefined,
                      nextVisitNote: nextVisitNote || undefined,
                    })
                    if (lastSavedById && lastSavedById !== workerId && lastSavedAt) {
                      if (confirm(`${lastSavedByName}님이 ${relativeTime(lastSavedAt)} 저장했어요.\n덮어쓸까요?`)) doSave()
                    } else {
                      doSave()
                    }
                  }}
                >
                  {isSavingMemo ? '저장 중...' : '메모 저장하기'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 항목별 금액 조정 — 작업 중이거나 완료 전 */}
        {(currentStatus === 'in_progress' || currentStatus === 'confirmed') && (
          <FieldBookingItemsEditor
            workerId={workerId}
            bookingId={booking.id}
            fallbackTotal={booking.finalPrice}
            onTotalChange={setLiveTotal}
          />
        )}

        {/* 릴스 촬영 유도 — 작업 중일 때만 */}
        {currentStatus === 'in_progress' && (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                <Film className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-amber-900">지금 영상을 찍어두세요!</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  작업 중 3컷만 찍으면 — 나중에 버튼 하나로 릴스가 완성돼요
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pl-1">
              <div className="flex items-center gap-2 text-xs text-amber-900">
                <span className="w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">1</span>
                오염된 부분 클로즈업 (작업 전 상태)
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-900">
                <span className="w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">2</span>
                열심히 작업하는 모습
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-900">
                <span className="w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">3</span>
                깨끗해진 결과물 클로즈업
              </div>
            </div>
            <p className="text-[11px] text-amber-700 pl-1">각 영상 10초 이내 · 세로로 찍어야 릴스에 딱 맞아요</p>
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

          {currentStatus === 'in_progress' && !paymentRequested && (
            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full h-14 text-base gap-2"
                disabled={isRequestingPayment || !booking.customerPhone}
                onClick={() => requestPayment({ workerId, bookingId: booking.id })}
              >
                <CircleDollarSign className="h-5 w-5" />
                {isRequestingPayment ? '발송 중...' : `결제 요청하기 · ${liveTotal.toLocaleString()}원`}
              </Button>
              {!booking.customerPhone && (
                <p className="text-xs text-muted-foreground text-center">고객 연락처가 없어 결제 요청을 보낼 수 없어요</p>
              )}
              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline py-1"
                disabled={isCompleting}
                onClick={() => {
                  if (confirm(`현금으로 ${liveTotal.toLocaleString()}원을 받으셨나요?\n\n확인하면 수금 완료 처리됩니다.`)) {
                    completePayment({ workerId, bookingId: booking.id })
                  }
                }}
              >
                현금 수금 등 직접 결제한 경우 →
              </button>
            </div>
          )}

          {currentStatus === 'in_progress' && paymentRequested && (
            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full h-14 text-base gap-2 bg-emerald-600 hover:bg-emerald-700"
                disabled={isCompleting}
                onClick={() => {
                  if (confirm(`${liveTotal.toLocaleString()}원 수금 완료할까요?`)) {
                    completePayment({ workerId, bookingId: booking.id })
                  }
                }}
              >
                <CheckCircle2 className="h-5 w-5" />
                {isCompleting ? '처리 중...' : `수금 완료 · ${liveTotal.toLocaleString()}원`}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline py-1"
                disabled={isCompleting}
                onClick={() => {
                  if (confirm('리뷰 요청을 보내지 않고 완료할까요?')) {
                    completePayment({ workerId, bookingId: booking.id, skipReview: true })
                  }
                }}
              >
                리뷰 요청 없이 완료하기 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
