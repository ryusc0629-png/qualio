'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  fieldStartWorkAction,
  fieldCompletePaymentAction,
  fieldRequestPaymentAction,
  fieldSendOnMyWayAction,
  fieldSaveOpenPhotosAction,
  fieldSaveLockupPhotosAction,
  fieldSaveChecklistPhotosAction,
} from '@/lib/actions/field'
import { FieldBookingItemsEditor } from '@/components/field/field-booking-items-editor'
import { ContactActions } from '@/components/dashboard/contact-actions'
import { buildUploadPath } from '@/lib/storage/upload-path'
import {
  ArrowLeft,
  Clock,
  Banknote,
  Camera,
  FileText,
  CheckCircle2,
  CircleDollarSign,
  Play,
  X,
  ChevronDown,
  Film,
  Send,
  Lock,
  DoorOpen,
  CheckCircle,
  ListChecks,
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

/** 보고서를 어디까지 채웠는지 — 작업 상세에서 남은 할 일을 보여주는 데만 쓴다 */
interface ReportProgress {
  beforeCount: number
  afterCount: number
  clipCount: number
  hasNotes: boolean
}

interface Props {
  workerId: string
  businessId: string
  booking: BookingData
  reportSentAt: string | null
  reportProgress: ReportProgress
  notifyOnMyWay: boolean
  onMyWaySentAt: string | null
  requiresLockup: boolean
  isRecurring: boolean
  existingOpenPhotoUrls: string[]
  existingLockupPhotoUrls: string[]
  checkinAt: string | null
  checkoutAt: string | null
  checklistItems: { id: string; label: string }[]
  existingChecklistPhotos: Record<string, string[]>
}

export function FieldBookingClient({ workerId, businessId, booking, reportSentAt, reportProgress, notifyOnMyWay, onMyWaySentAt, requiresLockup, isRecurring, existingOpenPhotoUrls, existingLockupPhotoUrls, checkinAt, checkoutAt, checklistItems, existingChecklistPhotos }: Props) {
  const [currentStatus, setCurrentStatus] = useState(booking.status)
  const [onMyWaySent, setOnMyWaySent] = useState(!!onMyWaySentAt)
  // 도착 사진 → 작업 자동 시작이 한 번만 실행되도록 (사진 여러 장 올려도 중복 시작 방지)
  const autoStartedRef = useRef(false)
  // 현장에서 항목을 조정하면 결제 금액도 실시간으로 따라간다
  const [liveTotal, setLiveTotal] = useState(booking.finalPrice)
  const [paymentRequested, setPaymentRequested] = useState(false)

  // 문단속 인증 — 오픈(도착)/마감(잠금) 사진
  const [openPhotos, setOpenPhotos] = useState<PhotoSlot[]>(
    existingOpenPhotoUrls.map((url) => ({ url, uploading: false }))
  )
  const [lockupPhotos, setLockupPhotos] = useState<PhotoSlot[]>(
    existingLockupPhotoUrls.map((url) => ({ url, uploading: false }))
  )
  const [checkinTime, setCheckinTime] = useState<string | null>(checkinAt)
  const [checkoutTime, setCheckoutTime] = useState<string | null>(checkoutAt)
  const openInputRef = useRef<HTMLInputElement>(null)
  const lockupInputRef = useRef<HTMLInputElement>(null)

  // 작업 매뉴얼 체크리스트 — 항목별 사진 상태
  const [checklistPhotos, setChecklistPhotos] = useState<Record<string, PhotoSlot[]>>(() => {
    const init: Record<string, PhotoSlot[]> = {}
    for (const it of checklistItems) {
      init[it.id] = (existingChecklistPhotos[it.id] ?? []).map((url) => ({ url, uploading: false }))
    }
    return init
  })
  const checklistInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // 현재 위치(GPS) 획득 — 거부·미지원·시간초과여도 빈 값으로 진행(막지 않음)
  const captureGeo = (): Promise<{ lat?: number; lng?: number; acc?: number }> =>
    new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      )
    })

  // 도착/마감 사진 저장 — 업로드 시엔 위치 함께, 삭제 시엔 위치 없이
  const saveOpenWithGeo = async (urls: string[]) => {
    const g = await captureGeo()
    saveOpenPhotos({ workerId, bookingId: booking.id, photoUrls: urls, ...g })
  }
  const saveOpenNoGeo = (urls: string[]) => saveOpenPhotos({ workerId, bookingId: booking.id, photoUrls: urls })
  const saveLockupWithGeo = async (urls: string[]) => {
    const g = await captureGeo()
    saveLockupPhotos({ workerId, bookingId: booking.id, photoUrls: urls, ...g })
  }
  const saveLockupNoGeo = (urls: string[]) => saveLockupPhotos({ workerId, bookingId: booking.id, photoUrls: urls })

  const { execute: saveOpenPhotos } = useAction(fieldSaveOpenPhotosAction, {
    onSuccess: ({ data }) => {
      if (data?.checkinAt) setCheckinTime(data.checkinAt)
      toast.success('도착(문 오픈) 사진이 저장됐어요!')
      // 문단속 현장에서 도착 사진을 올리면 작업이 자동으로 시작됨 (버튼 따로 안 눌러도 됨)
      if (requiresLockup && currentStatus === 'confirmed' && !autoStartedRef.current) {
        autoStartedRef.current = true
        startWork({ workerId, bookingId: booking.id })
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: saveLockupPhotos } = useAction(fieldSaveLockupPhotosAction, {
    onSuccess: ({ data }) => {
      setCheckoutTime(data?.done ? new Date().toISOString() : null)
      if (data?.done) toast.success('문단속(잠금) 사진이 저장됐어요! 마감 완료')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 작업 시작
  const { execute: startWork, isPending: isStarting } = useAction(fieldStartWorkAction, {
    onSuccess: () => {
      setCurrentStatus('in_progress')
      toast.success('작업을 시작했어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 기사 출발 알림 — 고객에게 "곧 도착해요" 알림톡
  const { execute: sendOnMyWay, isPending: isSendingOnMyWay } = useAction(fieldSendOnMyWayAction, {
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

  // 수금 완료
  const { execute: completePayment, isPending: isCompleting } = useAction(fieldCompletePaymentAction, {
    onSuccess: ({ data }) => {
      setCurrentStatus('completed')
      if (isRecurring) {
        toast.success('작업을 완료했어요!')
      } else if (data?.reviewSkipped) {
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

  // 작업 항목(체크리스트) 사진 저장
  const { execute: saveChecklistPhotos } = useAction(fieldSaveChecklistPhotosAction, {
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 체크리스트 항목별 사진 업로드
  const uploadChecklistPhoto = async (itemId: string, files: FileList) => {
    const cur = checklistPhotos[itemId] ?? []
    const remaining = 5 - cur.length
    if (remaining <= 0) {
      toast.error('사진은 최대 5장까지 올릴 수 있어요')
      return
    }
    const toUpload = Array.from(files).slice(0, remaining)
    setChecklistPhotos((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), ...toUpload.map(() => ({ url: '', uploading: true }))],
    }))

    const supabase = createClient()
    const uploaded: string[] = []
    for (const file of toUpload) {
      const path = buildUploadPath(`${businessId}/${booking.id}/checklist/${itemId}`, file.name)
      const { error } = await supabase.storage.from('report-photos').upload(path, file, { upsert: true })
      if (error) {
        toast.error('사진 업로드에 실패했어요')
        continue
      }
      uploaded.push(supabase.storage.from('report-photos').getPublicUrl(path).data.publicUrl)
    }

    // 저장 목록은 낡은 cur이 아니라 최신 state(prev)에서 파생 — 빠르게 연달아 올려도 밀리지 않음
    let finalUrls: string[] = []
    setChecklistPhotos((prev) => {
      const kept = (prev[itemId] ?? []).filter((p) => p.url && !p.uploading)
      const next = [...kept, ...uploaded.map((url) => ({ url, uploading: false }))]
      finalUrls = next.map((p) => p.url)
      return { ...prev, [itemId]: next }
    })
    saveChecklistPhotos({ workerId, bookingId: booking.id, itemId, photoUrls: finalUrls })
  }

  const removeChecklistPhoto = (itemId: string, url: string) => {
    const updated = (checklistPhotos[itemId] ?? []).filter((p) => p.url !== url)
    setChecklistPhotos((prev) => ({ ...prev, [itemId]: updated }))
    saveChecklistPhotos({
      workerId,
      bookingId: booking.id,
      itemId,
      photoUrls: updated.filter((p) => p.url).map((p) => p.url),
    })
  }

  // 체크리스트 완료 여부 — 모든 항목에 사진 1장 이상이면 작업 완료 가능
  const checklistDoneCount = checklistItems.filter((it) => (checklistPhotos[it.id] ?? []).some((p) => p.url)).length
  const checklistDone = checklistItems.length === 0 || checklistDoneCount === checklistItems.length

  // 문단속 사진(오픈/마감) 공용 업로더 — folder와 저장 콜백만 다르다
  const uploadLockupPhotos = async (
    files: FileList,
    folder: 'open' | 'lockup',
    photos: PhotoSlot[],
    setPhotos: React.Dispatch<React.SetStateAction<PhotoSlot[]>>,
    save: (urls: string[]) => void,
  ) => {
    const remaining = 5 - photos.length
    if (remaining <= 0) {
      toast.error('사진은 최대 5장까지 올릴 수 있어요')
      return
    }
    const toUpload = Array.from(files).slice(0, remaining)
    setPhotos((prev) => [...prev, ...toUpload.map(() => ({ url: '', uploading: true }))])

    const supabase = createClient()
    const uploaded: string[] = []
    for (const file of toUpload) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${businessId}/${booking.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('report-photos').upload(path, file, { upsert: true })
      if (error) {
        toast.error('사진 업로드에 실패했어요')
        continue
      }
      uploaded.push(supabase.storage.from('report-photos').getPublicUrl(path).data.publicUrl)
    }

    // 저장 목록은 낡은 photos가 아니라 최신 state(prev)에서 파생 — 빠르게 연달아 올려도 밀리지 않음
    let finalUrls: string[] = []
    setPhotos((prev) => {
      const kept = prev.filter((p) => p.url && !p.uploading)
      const next = [...kept, ...uploaded.map((url) => ({ url, uploading: false }))]
      finalUrls = next.map((p) => p.url)
      return next
    })
    save(finalUrls)
  }

  const removeLockupPhoto = (
    url: string,
    photos: PhotoSlot[],
    setPhotos: React.Dispatch<React.SetStateAction<PhotoSlot[]>>,
    save: (urls: string[]) => void,
  ) => {
    const updated = photos.filter((p) => p.url !== url)
    setPhotos(updated)
    save(updated.filter((p) => p.url).map((p) => p.url))
  }

  const fmtKstTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })

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

  // 보고서에서 남은 할 일 — 현장을 떠나기 전에 뭘 더 해야 하는지 카드에 그대로 보여준다
  const reportSteps = [
    { label: '작업 전 사진', done: reportProgress.beforeCount > 0 },
    { label: '작업 중 영상', done: reportProgress.clipCount >= 3 },
    { label: '작업 후 사진', done: reportProgress.afterCount > 0 },
    { label: '하자·특이사항', done: reportProgress.hasNotes },
  ]

  // 문단속 현장인데 아직 도착 사진이 없으면 → 시작 버튼이 곧장 카메라를 열고, 사진 올리면 자동 시작
  const hasArrivalPhoto = openPhotos.some((p) => p.url)
  const startNeedsArrivalPhoto = requiresLockup && !hasArrivalPhoto

  // 법인 현장 — 그 자리에서 돈이 안 나온다. 결재가 돌고 계산서를 끊어야 입금되기 때문에
  // 현장은 '작업 완료'까지만 하고, 청구는 사장님에게 넘긴다(전액 미수금 + 대표 알림).
  const completeInvoice = () => {
    if (!confirm(
      `${liveTotal.toLocaleString()}원 전액을 계산서로 청구할까요?\n\n` +
      '작업은 완료 처리되고, 사장님께 세금계산서 발행 요청 알림이 갑니다.\n' +
      "받을 돈은 '못 받은 돈'에 남아요.",
    )) return
    completePayment({ workerId, bookingId: booking.id, skipReview: true, invoiceRequested: true })
  }

  // 일부만 받았을 때 — 받은 금액만 입력, 나머지는 미수금으로 남긴다
  const completeWithPartial = (skipReview?: boolean) => {
    const raw = window.prompt(
      `실제로 받은 금액만 입력해주세요 (원)\n총 ${liveTotal.toLocaleString()}원 중 나머지는 미수금으로 남아요.`,
      '',
    )
    if (raw === null) return
    const amount = parseInt(raw.replace(/[^0-9]/g, ''), 10)
    if (isNaN(amount) || amount < 0) {
      toast.error('숫자로 입력해주세요 (예: 50000)')
      return
    }
    // 전액 이상이면 미수금 없이 완료, 아니면 받은 만큼만 기록
    completePayment(
      amount >= liveTotal
        ? { workerId, bookingId: booking.id, skipReview }
        : { workerId, bookingId: booking.id, skipReview, paidAmount: amount },
    )
  }

  return (
    // 하단 고정 버튼 뒤로 내용이 가리지 않도록 넉넉히 띄운다.
    // 작업 중에는 아래에 큰 버튼 1개 + 보조 링크 2줄이 깔려서 pb-32(128px)로는 모자랐다.
    <div className="min-h-dvh bg-gray-50 pb-56">
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

        {/* 예정 상태 안내 — 지금 할 한 가지(작업 시작)만 남기고, 나머지는 시작 후 등장 */}
        {currentStatus === 'confirmed' && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 flex items-start gap-2.5 text-sm text-blue-800">
            <Play className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              {/* '나중에 뭐가 나타난다'는 안내는 지웠다 — 지금 할 일이 아니라 화면 설명이라 읽는 부담만 준다.
                  대신 사진이 왜 필요한지(출근 도장)를 밝힌다. 그게 직원이 실제로 궁금한 것이다. */}
              {requiresLockup
                ? '도착하면 문 여는 사진을 먼저 찍고, 맨 아래 초록 버튼을 눌러 작업을 시작하세요.'
                : '현장에 도착하면 맨 아래 초록 버튼을 눌러 작업을 시작하세요.'}
            </p>
          </div>
        )}

        {/* 문단속 인증 — '문단속 필요' 현장에서만. 예정/작업중에만 노출 (완료 후엔 숨김) */}
        {requiresLockup && (currentStatus === 'confirmed' || currentStatus === 'in_progress') && (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-amber-200">
              <Lock className="h-4 w-4 text-amber-600" />
              <p className="font-bold text-amber-900">문단속 인증 (필수)</p>
            </div>
            <div className="p-4 space-y-4">
              {/* 왜 찍는지를 먼저 말한다 — '문단속'만으로는 남의 일 같지만, 출퇴근 도장이라고 하면 내 일이 된다 */}
              <p className="text-xs text-amber-800">
                이 사진이 <span className="font-semibold">출퇴근 도장</span>이에요.
                <span className="font-semibold"> 문 열 때</span> 한 장 올리면 출근,
                <span className="font-semibold"> 다 끝내고 잠근 뒤</span> 한 장 올리면 퇴근으로 기록돼요.
                잠금 사진 칸은 맨 아래에 있어요.
              </p>

              {/* ① 도착 · 문 오픈 */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                  <DoorOpen className="h-4 w-4" />
                  <span>① 도착 · 문 오픈 사진</span>
                  {checkinTime && (
                    <span className="ml-auto text-xs font-medium text-amber-700">출근 인증 {fmtKstTime(checkinTime)}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {openPhotos.map((photo) => (
                    <div key={photo.url || 'up'} className="relative w-20 h-20 rounded-lg overflow-hidden border bg-white">
                      {photo.uploading ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.url} alt="오픈 사진" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeLockupPhoto(photo.url, openPhotos, setOpenPhotos, saveOpenNoGeo)}
                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                          >
                            <X className="h-3 w-3 text-white" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {openPhotos.length < 1 && (
                    <button
                      type="button"
                      onClick={() => openInputRef.current?.click()}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-amber-400/60 flex flex-col items-center justify-center gap-1 bg-white/50"
                    >
                      <Camera className="h-5 w-5 text-amber-600" />
                      <span className="text-[10px] text-amber-700">사진 추가</span>
                    </button>
                  )}
                </div>
                <input
                  ref={openInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) uploadLockupPhotos(e.target.files, 'open', openPhotos, setOpenPhotos, saveOpenWithGeo)
                    e.target.value = ''
                  }}
                />
              </div>

            </div>
          </div>
        )}

        {/* 작업 항목(체크리스트) — 작업 시작 후에만 노출. 대표가 정한 항목마다 사진을 올려야 완료 가능 */}
        {checklistItems.length > 0 && (currentStatus === 'in_progress' || currentStatus === 'completed') && (
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/50 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-emerald-200">
              <ListChecks className="h-4 w-4 text-emerald-600" />
              <p className="font-bold text-emerald-900">작업 항목</p>
              <span className="ml-auto text-xs font-semibold text-emerald-700">
                {checklistDoneCount}/{checklistItems.length} 완료
              </span>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-emerald-800">
                각 항목마다 사진을 <span className="font-semibold">1장 이상</span> 올려야 작업을 완료할 수 있어요.
              </p>
              {checklistItems.map((it, idx) => {
                const photos = checklistPhotos[it.id] ?? []
                const done = photos.some((p) => p.url)
                return (
                  <div key={it.id} className="space-y-2 border-t border-emerald-100 pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                      {done ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border-2 border-emerald-300 inline-block shrink-0" />
                      )}
                      <span>{idx + 1}. {it.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {photos.map((photo) => (
                        <div key={photo.url || 'up'} className="relative w-20 h-20 rounded-lg overflow-hidden border bg-white">
                          {photo.uploading ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photo.url} alt="작업 사진" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeChecklistPhoto(it.id, photo.url)}
                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                              >
                                <X className="h-3 w-3 text-white" />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                      {photos.length < 5 && (
                        <button
                          type="button"
                          onClick={() => checklistInputRefs.current[it.id]?.click()}
                          className="w-20 h-20 rounded-lg border-2 border-dashed border-emerald-400/60 flex flex-col items-center justify-center gap-1 bg-white/50"
                        >
                          <Camera className="h-5 w-5 text-emerald-600" />
                          <span className="text-[10px] text-emerald-700">사진 추가</span>
                        </button>
                      )}
                    </div>
                    <input
                      ref={(el) => { checklistInputRefs.current[it.id] = el }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) uploadChecklistPhoto(it.id, e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 작업 보고서 — 현장에서 해야 할 '진짜 일'. 사진·영상·메모를 여기 한 곳에서 다 한다.
            예전엔 현장 메모 / 릴스 안내 / 보고서 링크가 따로 있었는데, 셋 다 같은 보고서로 들어가는
            내용이라 직원 입장에선 같은 걸 세 번 물어보는 화면이었다. 하나로 합쳤다. */}
        {(currentStatus === 'in_progress' || currentStatus === 'completed') && (
          <Link
            href={`/field/${workerId}/${booking.id}/report`}
            className="block rounded-xl bg-white border-2 border-primary/30 overflow-hidden"
          >
            <div className="px-4 py-3.5 flex items-center gap-3 bg-primary/5 border-b border-primary/20">
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold">작업 보고서</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {reportSentAt
                    ? '고객에게 발송 완료'
                    : '작업 사진과 하자·특이사항을 기록해주세요. 고객에게 그대로 발송돼요'}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 -rotate-90" />
            </div>

            {/* 남은 할 일 — 무엇이 비었는지 열어보지 않고 알 수 있게 */}
            <div className="px-4 py-3 grid grid-cols-2 gap-x-3 gap-y-2">
              {reportSteps.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5 text-xs">
                  {s.done ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30 inline-block shrink-0" />
                  )}
                  <span className={s.done ? 'text-emerald-700 font-medium' : 'text-muted-foreground'}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {/* 아직 영상을 안 올렸으면 지금 찍어야 할 3컷을 알려준다 — 현장을 떠나면 다시 못 찍는다 */}
            {currentStatus === 'in_progress' && reportProgress.clipCount < 3 && (
              <div className="mx-4 mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Film className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-xs font-bold text-amber-900">나가기 전에 영상 3컷만 찍어두세요</p>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  ① 더러운 곳 클로즈업 → ② 작업하는 모습 → ③ 깨끗해진 결과
                  <br />
                  각 10초 이내 · 세로로 찍어주세요. 나중에 버튼 하나로 홍보 영상이 만들어져요.
                </p>
              </div>
            )}
          </Link>
        )}

        {/* 추가 서비스 — 일회성 현장, 작업 시작 후에만 (정기청소는 월말 정산이라 현장 추가 항목 없음).
            평소엔 접혀 있다 — 늘 하는 일이 아니라 청소 범위가 늘었을 때만 여는 칸이다. */}
        {!isRecurring && currentStatus === 'in_progress' && (
          <FieldBookingItemsEditor
            workerId={workerId}
            bookingId={booking.id}
            fallbackTotal={booking.finalPrice}
            onTotalChange={setLiveTotal}
          />
        )}

        {/* ② 마감 · 문 잠금 — 작업 순서상 맨 마지막이라 화면에서도 맨 아래에 둔다.
            도착 단계에서 두 칸이 같이 보이면 "지금 뭘 찍으라는 거지?" 하고 헷갈린다. */}
        {requiresLockup && currentStatus === 'in_progress' && (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-amber-200">
              <Lock className="h-4 w-4 text-amber-600" />
              <p className="font-bold text-amber-900">마지막 — 문 잠그고 사진 (퇴근 도장)</p>
            </div>
            <div className="p-4">
            <div className="space-y-2">
              {checkoutTime && (
                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle className="h-3.5 w-3.5" /> 퇴근 도장 찍혔어요 · {fmtKstTime(checkoutTime)}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {lockupPhotos.map((photo) => (
                  <div key={photo.url || 'up'} className="relative w-20 h-20 rounded-lg overflow-hidden border bg-white">
                    {photo.uploading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url} alt="잠금 사진" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeLockupPhoto(photo.url, lockupPhotos, setLockupPhotos, saveLockupNoGeo)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                        >
                          <X className="h-3 w-3 text-white" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {lockupPhotos.length < 1 && (
                  <button
                    type="button"
                    onClick={() => lockupInputRef.current?.click()}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-amber-400/60 flex flex-col items-center justify-center gap-1 bg-white/50"
                  >
                    <Camera className="h-5 w-5 text-amber-600" />
                    <span className="text-[10px] text-amber-700">사진 추가</span>
                  </button>
                )}
              </div>
              <input
                ref={lockupInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) uploadLockupPhotos(e.target.files, 'lockup', lockupPhotos, setLockupPhotos, saveLockupWithGeo)
                  e.target.value = ''
                }}
              />
              {!checkoutTime && (
                <p className="text-[11px] text-amber-700">
                  나가기 전 꼭 올려주세요. 예상 시간이 지나도 안 올라오면 사장님께 알림이 가요.
                </p>
              )}
            </div>
            </div>
          </div>
        )}

        {/* 완료 상태 안내 */}
        {currentStatus === 'completed' && (
          <div className="space-y-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="font-medium text-emerald-800">{isRecurring ? '작업 완료' : '수금 완료'}</p>
              </div>
              <p className="text-xs text-emerald-700 ml-7">
                {isRecurring ? '정기청소는 월말에 정산돼요' : '리뷰 요청이 고객에게 자동 발송됐어요'}
              </p>
            </div>

          </div>
        )}
      </div>

      {/* 하단 고정 액션 버튼 */}
      {currentStatus !== 'completed' && currentStatus !== 'cancelled' && currentStatus !== 'no_show' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 pb-safe">
          {currentStatus === 'confirmed' && (
            <div className="space-y-2">
              {/* 출발 알림 — 이동 중 탭. 고객이 끄지 않았고 연락처가 있을 때만 */}
              {notifyOnMyWay && booking.customerPhone && (
                onMyWaySent ? (
                  <div className="flex items-center justify-center gap-1.5 text-sm text-emerald-700 font-medium py-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    고객에게 출발 알림을 보냈어요
                  </div>
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-12 text-base gap-2"
                    disabled={isSendingOnMyWay}
                    onClick={() => sendOnMyWay({ workerId, bookingId: booking.id })}
                  >
                    <Send className="h-5 w-5" />
                    {isSendingOnMyWay ? '보내는 중...' : '고객에게 출발 알림 보내기'}
                  </Button>
                )
              )}
              <Button
                size="lg"
                className="w-full h-14 text-base gap-2"
                disabled={isStarting}
                onClick={() => {
                  // 문단속 현장 + 도착 사진 없음 → 카메라부터 열기 (사진 올라오면 자동으로 작업 시작)
                  if (startNeedsArrivalPhoto) {
                    openInputRef.current?.click()
                  } else {
                    startWork({ workerId, bookingId: booking.id })
                  }
                }}
              >
                {startNeedsArrivalPhoto ? <Camera className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                {isStarting ? '처리 중...' : startNeedsArrivalPhoto ? '도착 사진 찍고 작업 시작' : '작업 시작하기'}
              </Button>
            </div>
          )}

          {/* 정기청소 — 월말 정산이라 결제 요청 없이 '작업 완료하기'만 */}
          {currentStatus === 'in_progress' && isRecurring && (
            <div className="space-y-1.5">
              {!checklistDone && (
                <p className="text-xs text-center text-amber-600">
                  작업 항목 사진을 모두 올려야 완료할 수 있어요 ({checklistDoneCount}/{checklistItems.length})
                </p>
              )}
              <Button
                size="lg"
                className="w-full h-14 text-base gap-2 bg-emerald-600 hover:bg-emerald-700"
                disabled={isCompleting || !checklistDone}
                onClick={() => {
                  if (confirm('이 현장 작업을 완료할까요?')) {
                    completePayment({ workerId, bookingId: booking.id, skipReview: true })
                  }
                }}
              >
                <CheckCircle2 className="h-5 w-5" />
                {isCompleting ? '처리 중...' : '작업 완료하기'}
              </Button>
            </div>
          )}

          {currentStatus === 'in_progress' && !isRecurring && !paymentRequested && (
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
              <button
                type="button"
                className="w-full text-xs text-amber-600 underline py-1"
                disabled={isCompleting}
                onClick={() => completeWithPartial()}
              >
                일부만 받았어요 (나머지 미수금으로 남기기) →
              </button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline py-1"
                disabled={isCompleting}
                onClick={() => completeInvoice()}
              >
                회사 결재라 나중에 입금돼요 (계산서 청구) →
              </button>
            </div>
          )}

          {currentStatus === 'in_progress' && !isRecurring && paymentRequested && (
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
                className="w-full text-xs text-amber-600 underline py-1"
                disabled={isCompleting}
                onClick={() => completeWithPartial()}
              >
                일부만 받았어요 (나머지 미수금으로 남기기) →
              </button>
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
