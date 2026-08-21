'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { compressImage, mapWithConcurrency } from '@/lib/upload/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CareAdviceField, CareAdviceInput, CareAdviceBox } from '@/components/dashboard/care-advice-field'
import { createClient } from '@/lib/supabase/client'
import { REPORT_PHOTO_MAX } from '@/lib/config/photos'
import { saveReportAction, ownerSendReportAction, ownerGenerateAiReportAction, skipReportSendAction } from '@/lib/actions/reports'
import { canSendReport } from '@/lib/utils/report-send-guard'
import {
  ArrowLeft,
  Camera,
  X,
  Upload,
  Send,
  CheckCircle2,
  Save,
  Sparkles,
  Plus,
  Film,
  Loader2,
  Images,
} from 'lucide-react'

type PhotoSlot = { url: string; uploading: boolean }

// 작업 전·후 각각 올릴 수 있는 장수(현장 앱·시공사례 편집창과 동일 — lib/config/photos.ts)
const MAX_PHOTOS = REPORT_PHOTO_MAX

interface BookingInfo {
  id: string
  customerName: string
  customerPhone: string | null
  serviceAddress: string | null
  scheduledAt: string
  /** 예약 상태 — 아직 시작 안 한 일정에는 보고서를 보낼 수 없다 */
  status: string
  /** 정기계약 방문이면 계약 id — 정기 거래처엔 방문마다 보고서를 보내지 않는다 */
  contractId: string | null
}

interface AiReportData {
  beforeStatus: string
  workDetails: string
  afterResult: string
  additionalNotes: string
  recommendedServices: string[]
}

interface ExistingReport {
  id: string
  notes: string | null
  preventiveNote: string | null
  careAdvice: string | null
  careMonths: number
  sentAt: string | null
  beforeUrls: string[]
  afterUrls: string[]
  aiReportData: AiReportData | null
  reelStatus: string
  reelUrl: string | null
  isPublic: boolean
}

interface ServiceItem {
  name: string
  basePrice: number
}

interface Props {
  businessId: string
  booking: BookingInfo
  existingReport: ExistingReport | null
  serviceItems: ServiceItem[]
}

export function OwnerReportClient({ businessId, booking, existingReport, serviceItems }: Props) {
  const [reelStatus] = useState(existingReport?.reelStatus ?? 'idle')
  const [reelUrl] = useState<string | null>(existingReport?.reelUrl ?? null)
  const [notes, setNotes] = useState(existingReport?.notes ?? '')
  // 미리 챙긴 것·지켜볼 것 — 문제 생기기 전에 먼저 발견·조치한 예방 케어(고객 만족 엔진)
  const [preventiveNote, setPreventiveNote] = useState(existingReport?.preventiveNote ?? '')
  const [before, setBefore] = useState<PhotoSlot[]>(
    existingReport?.beforeUrls.map((url) => ({ url, uploading: false })) ?? []
  )
  const [after, setAfter] = useState<PhotoSlot[]>(
    existingReport?.afterUrls.map((url) => ({ url, uploading: false })) ?? []
  )
  // 앞으로 손봐야 할 것 — 그 시점이 되면 알림이 온다
  const [careAdvice, setCareAdvice] = useState(existingReport?.careAdvice ?? '')
  const [careMonths, setCareMonths] = useState(existingReport?.careMonths ?? 6)
  const [savedReportId, setSavedReportId] = useState<string | null>(existingReport?.id ?? null)
  const [alreadySent, setAlreadySent] = useState(!!existingReport?.sentAt)
  // 아직 시작 안 한 일정에는 보고서를 못 보낸다(서버에서도 막지만, 눌러보고 실패하기 전에 알려준다)
  const canSend = canSendReport(booking.status)
  const [aiReport, setAiReport] = useState<AiReportData | null>(existingReport?.aiReportData ?? null)
  // 처음 적은 메모 — 정리하면 notes가 정리된 글로 덮어써지므로 따로 들고 있는다.
  // '보고서 다시 작성하기'가 이 값을 재료로 쓴다(새로고침하면 비므로 그때는 정리본을 쓴다).
  const [rawMemo, setRawMemo] = useState('')
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    new Set(existingReport?.aiReportData?.recommendedServices ?? [])
  )
  const [showServicePicker, setShowServicePicker] = useState(false)
  // 홈페이지 시공 사례 갤러리 공개 여부
  const [isPublic, setIsPublic] = useState(existingReport?.isPublic ?? false)

  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)

  const isUploading = before.some((p) => p.uploading) || after.some((p) => p.uploading)
  const hasPhotos = before.some((p) => !p.uploading && p.url) || after.some((p) => !p.uploading && p.url)

  // 보고서 저장
  const { execute: saveReport, isPending: isSaving } = useAction(saveReportAction, {
    onSuccess: ({ data }) => {
      if (data?.reportId) setSavedReportId(data.reportId)
      toast.success('보고서가 저장됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 보고서 발송
  const { execute: sendReport, isPending: isSending } = useAction(ownerSendReportAction, {
    onSuccess: () => {
      setAlreadySent(true)
      toast.success('고객에게 보고서가 발송됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 발송 건너뛰기
  const { execute: skipSend, isPending: isSkipping } = useAction(skipReportSendAction, {
    onSuccess: () => {
      setAlreadySent(true)
      toast.success('발송을 건너뛰었어요. 완료 처리됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // AI 포맷된 notes 텍스트 생성
  const formatAiNotes = (report: AiReportData, services: Set<string>) => {
    const recSection = report.recommendedServices.filter((s) => services.has(s)).length > 0
      ? `\n\n💡 추천 서비스\n${report.recommendedServices.filter((s) => services.has(s)).join(', ')}`
      : ''
    return `📋 작업 전 상태\n${report.beforeStatus}\n\n🔧 작업 내용\n${report.workDetails}\n\n✨ 작업 결과\n${report.afterResult}\n\n📌 참고사항\n${report.additionalNotes}${recSection}`
  }

  // AI 보고서 생성
  const { execute: generateAi, isPending: isGenerating } = useAction(ownerGenerateAiReportAction, {
    onSuccess: ({ data }) => {
      if (data?.report) {
        // '앞으로 손봐야 할 것'은 ai_report_data에 같이 담지 않는다 —
        // 이 글의 주인은 reports.care_advice 컬럼 하나다(고객 문서·홍보 영상 대본이 거기서 읽는다).
        const { careAdvice: polishedAdvice, ...report } = data.report
        const newServices = new Set(report.recommendedServices)
        setAiReport(report)
        if (polishedAdvice) setCareAdvice(polishedAdvice)
        setSelectedServices(newServices)
        const formatted = formatAiNotes(report, newServices)
        setNotes(formatted)
        toast.success('전문 보고서가 작성됐어요!')

        // AI 생성 즉시 자동 저장 (API 비용 낭비 방지)
        saveReport({
          bookingId:       booking.id,
          notes:           formatted,
          preventiveNote:  preventiveNote.trim() || undefined,
          beforePhotoUrls: before.filter((p) => !p.uploading && p.url).map((p) => p.url),
          afterPhotoUrls:  after.filter((p) => !p.uploading && p.url).map((p) => p.url),
          sendAlimtalk:    false,
          careAdvice:      polishedAdvice || careAdvice,
          // 이미 다듬은 글이라고 알려줘서 저장 쪽에서 또 다듬지 않게 한다
          ...(polishedAdvice ? { careAdvicePolished: true } : {}),
          careMonths,
          isPublic,
          aiReportData:    report,
        })
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? '보고서 작성에 실패했어요. 다시 시도해주세요'),
  })

  // 사진 업로드
  const uploadPhotos = async (
    files: FileList,
    slots: PhotoSlot[],
    setSlots: React.Dispatch<React.SetStateAction<PhotoSlot[]>>,
    type: 'before' | 'after',
  ) => {
    const remaining = MAX_PHOTOS - slots.length
    if (remaining <= 0) {
      toast.error(`사진은 최대 ${MAX_PHOTOS}장까지 등록할 수 있어요`)
      return
    }
    const toUpload = Array.from(files).slice(0, remaining)
    const placeholders = toUpload.map(() => ({ url: '', uploading: true }))
    setSlots((prev) => [...prev, ...placeholders])

    const supabase = createClient()

    // 올리기 전에 줄이고 3장씩 동시에 — 현장 앱과 같은 방식
    const results = await mapWithConcurrency(toUpload, async (file) => {
      const small = await compressImage(file)
      const ext = small.name.split('.').pop() ?? 'jpg'
      const path = `${businessId}/${booking.id}/${type}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('report-photos').upload(path, small, { upsert: true })
      if (error) return null
      return supabase.storage.from('report-photos').getPublicUrl(path).data.publicUrl
    })

    const uploaded = results.filter((u): u is string => !!u)
    if (uploaded.length < toUpload.length) {
      toast.error(`사진 ${toUpload.length - uploaded.length}장을 못 올렸어요. 다시 시도해주세요`)
    }

    setSlots((prev) => {
      const result = [...prev.filter((p) => !p.uploading)]
      uploaded.forEach((url) => result.push({ url, uploading: false }))
      return result
    })
  }

  const removePhoto = (url: string, setSlots: React.Dispatch<React.SetStateAction<PhotoSlot[]>>) =>
    setSlots((prev) => prev.filter((p) => p.url !== url))

  const handleSave = () => {
    if (!hasPhotos) {
      const confirmed = window.confirm('사진을 업로드하지 않고 저장하시겠습니까?')
      if (!confirmed) return
    }
    saveReport({
      bookingId:       booking.id,
      notes:           notes.trim() || undefined,
      preventiveNote:  preventiveNote.trim() || undefined,
      beforePhotoUrls: before.filter((p) => !p.uploading && p.url).map((p) => p.url),
      afterPhotoUrls:  after.filter((p) => !p.uploading && p.url).map((p) => p.url),
      sendAlimtalk:    false,
      careAdvice,
      careMonths,
      isPublic,
      aiReportData: aiReport ? {
        ...aiReport,
        recommendedServices: aiReport.recommendedServices.filter((s) => selectedServices.has(s)),
      } : undefined,
    })
  }

  const handleSend = () => {
    if (!savedReportId) return
    // 이미 보낸 뒤에도 다시 보낼 수 있어야 한다 — 발송이 실패했거나 고객이 못 받은 경우가 있다.
    // 다만 실수로 두 번 보내지 않도록 다른 문구로 한 번 더 확인한다.
    const confirmed = window.confirm(
      alreadySent
        ? '이미 한 번 보낸 보고서예요.\n\n고객에게 다시 보낼까요?'
        : '보고서를 검토하셨나요?\n\n고객에게 카카오 알림톡으로 보고서가 발송됩니다.'
    )
    if (!confirmed) return
    sendReport({ reportId: savedReportId })
  }

  const date = new Date(booking.scheduledAt).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })

  // 사진 편집 섹션
  const PhotoSection = ({
    label,
    hint,
    slots,
    setSlots,
    inputRef,
    type,
  }: {
    label: string
    hint: string
    slots: PhotoSlot[]
    setSlots: React.Dispatch<React.SetStateAction<PhotoSlot[]>>
    inputRef: React.RefObject<HTMLInputElement | null>
    type: 'before' | 'after'
  }) => (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {slots.map((p) =>
          p.uploading ? (
            <div key={`uploading-${type}-${Math.random()}`} className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center animate-pulse">
              <Upload className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <div key={p.url} className="relative w-20 h-20 rounded-xl overflow-hidden border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(p.url, setSlots)}
                className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          )
        )}
        {slots.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <Camera className="h-5 w-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">추가</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            uploadPhotos(e.target.files, slots, setSlots, type)
            e.target.value = ''
          }
        }}
      />
    </div>
  )

  const getServicePrice = (serviceName: string) =>
    serviceItems.find((s) => s.name === serviceName)

  const toggleService = (name: string) => {
    const next = new Set(selectedServices)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedServices(next)
    if (aiReport) {
      const updated = { ...aiReport, recommendedServices: Array.from(new Set([...aiReport.recommendedServices, ...next])) }
      setAiReport(updated)
      setNotes(formatAiNotes(updated, next))
    }
  }

  const addService = (name: string) => {
    if (!aiReport) return
    const next = new Set(selectedServices)
    next.add(name)
    setSelectedServices(next)
    const updated = { ...aiReport, recommendedServices: [...new Set([...aiReport.recommendedServices, name])] }
    setAiReport(updated)
    setNotes(formatAiNotes(updated, next))
    setShowServicePicker(false)
  }

  const availableServices = serviceItems.filter(
    (s) => !aiReport?.recommendedServices.includes(s.name)
  )

  const updateAiField = (field: keyof Omit<AiReportData, 'recommendedServices'>, value: string) => {
    if (!aiReport) return
    const updated = { ...aiReport, [field]: value }
    setAiReport(updated)
    setNotes(formatAiNotes(updated, selectedServices))
  }

  const EditableSection = ({
    label,
    value,
    field,
    bgClass,
    borderClass,
    labelClass,
    textClass,
  }: {
    label: string
    value: string
    field: keyof Omit<AiReportData, 'recommendedServices'>
    bgClass: string
    borderClass: string
    labelClass: string
    textClass: string
  }) => {
    const [editing, setEditing] = useState(false)
    return (
      <div className={`rounded-lg ${bgClass} border ${borderClass} p-3 space-y-1`}>
        <p className={`text-xs font-semibold ${labelClass}`}>{label}</p>
        {editing ? (
          <textarea
            className={`w-full text-sm ${textClass} bg-transparent border-none outline-none resize-none`}
            value={value}
            rows={3}
            autoFocus
            onChange={(e) => updateAiField(field, e.target.value)}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <p
            className={`text-sm ${textClass} cursor-pointer hover:opacity-70`}
            onClick={() => setEditing(true)}
          >
            {value}
          </p>
        )}
      </div>
    )
  }

  const AiReportView = ({ report }: { report: AiReportData }) => (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground text-center">각 항목을 탭하면 수정할 수 있어요</p>
      <EditableSection label="작업 전 상태" value={report.beforeStatus} field="beforeStatus" bgClass="bg-amber-50" borderClass="border-amber-100" labelClass="text-amber-800" textClass="text-amber-900" />
      <EditableSection label="작업 내용" value={report.workDetails} field="workDetails" bgClass="bg-blue-50" borderClass="border-blue-100" labelClass="text-blue-800" textClass="text-blue-900" />
      <EditableSection label="작업 결과" value={report.afterResult} field="afterResult" bgClass="bg-emerald-50" borderClass="border-emerald-100" labelClass="text-emerald-800" textClass="text-emerald-900" />
      <EditableSection label="참고사항" value={report.additionalNotes} field="additionalNotes" bgClass="bg-gray-50" borderClass="border-gray-200" labelClass="text-gray-700" textClass="text-gray-800" />
      <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-violet-800">추천 서비스</p>
          {report.recommendedServices.length > 0 && (
            <p className="text-[10px] text-violet-500">체크 해제하면 보고서에서 빠져요</p>
          )}
        </div>
        {report.recommendedServices.length > 0 && (
          <div className="space-y-1.5">
            {report.recommendedServices.map((name) => {
              const svc = getServicePrice(name)
              const isSelected = selectedServices.has(name)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleService(name)}
                  className={`w-full flex items-center gap-3 rounded-md px-3 py-2.5 border transition-colors text-left ${
                    isSelected
                      ? 'bg-white border-violet-200'
                      : 'bg-violet-50/50 border-violet-100 opacity-50'
                  }`}
                >
                  <div className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-violet-600 border-violet-600'
                      : 'border-gray-300 bg-white'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className={`text-sm font-medium flex-1 ${isSelected ? 'text-violet-900' : 'text-violet-400 line-through'}`}>{name}</span>
                  {svc && (
                    <span className={`text-xs ${isSelected ? 'text-violet-600' : 'text-violet-300'}`}>{svc.basePrice.toLocaleString()}원~</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {availableServices.length > 0 && (
          <div className="pt-1">
            {!showServicePicker ? (
              <button
                type="button"
                onClick={() => setShowServicePicker(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-md px-3 py-2 border border-dashed border-violet-300 text-violet-600 hover:bg-violet-100/50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">서비스 직접 추가</span>
              </button>
            ) : (
              <div className="space-y-1.5 bg-white rounded-md border border-violet-200 p-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-medium text-violet-700">추가할 서비스 선택</p>
                  <button type="button" onClick={() => setShowServicePicker(false)} className="p-0.5">
                    <X className="h-3.5 w-3.5 text-violet-400" />
                  </button>
                </div>
                {availableServices.map((svc) => (
                  <button
                    key={svc.name}
                    type="button"
                    onClick={() => addService(svc.name)}
                    className="w-full flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-violet-50 transition-colors text-left"
                  >
                    <span className="text-sm text-violet-900">{svc.name}</span>
                    <span className="text-xs text-violet-500">{svc.basePrice.toLocaleString()}원~</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {report.recommendedServices.length === 0 && availableServices.length === 0 && (
          <p className="text-xs text-violet-500 text-center py-1">등록된 서비스 항목이 없어요</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-gray-50 pb-40">
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
        <Link href="/dashboard/alimtalk-todo" className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-bold">작업 완료 보고서</h1>
          <p className="text-xs text-muted-foreground">{booking.customerName} · {date}</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {alreadySent && (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">보고서 발송 완료</p>
              <p className="text-xs text-emerald-600">수정 후 다시 저장하면 고객 보고서에 바로 반영돼요</p>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-white border p-4">
          <PhotoSection
            label="작업 전 사진"
            hint="작업 시작 전 현장 상태를 촬영해주세요"
            slots={before}
            setSlots={setBefore}
            inputRef={beforeInputRef}
            type="before"
          />
        </div>

        <div className="rounded-xl bg-white border p-4">
          <PhotoSection
            label="작업 후 사진"
            hint="작업 완료 후 깨끗해진 모습을 촬영해주세요"
            slots={after}
            setSlots={setAfter}
            inputRef={afterInputRef}
            type="after"
          />
        </div>

        {/* 홈페이지 시공 사례 공개 토글 */}
        <div className="rounded-xl bg-white border p-4">
          <button
            type="button"
            onClick={() => setIsPublic((v) => !v)}
            className="w-full flex items-center gap-3 text-left"
            aria-pressed={isPublic}
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Images className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">이 사진을 홈페이지 시공 사례로 올리기</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                켜면 우리 홈페이지 ‘시공 사례’에 비포·애프터로 보여요. 고객 이름·연락처·메모는 나가지 않아요.
              </p>
            </div>
            <span className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${isPublic ? 'bg-primary' : 'bg-muted'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isPublic ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
          </button>
          {isPublic && !hasPhotos && (
            <p className="mt-2.5 text-xs text-amber-600">
              작업 전·후 사진을 한 장씩은 올려야 시공 사례로 보여요.
            </p>
          )}
        </div>

        {/* 릴스 영상 현황 — 현장 직원이 신청한 경우만 표시 */}
        {reelStatus !== 'idle' && (
          <div className="rounded-xl bg-white border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-rose-500" />
              <Label className="text-sm font-medium">릴스 영상</Label>
              <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                reelStatus === 'done'
                  ? 'bg-emerald-100 text-emerald-700'
                  : reelStatus === 'processing'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
              }`}>
                {reelStatus === 'done' ? '완성' : reelStatus === 'processing' ? '편집 중' : '실패'}
              </span>
            </div>

            {reelStatus === 'processing' && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3">
                <Loader2 className="h-4 w-4 text-amber-600 animate-spin shrink-0" />
                <p className="text-sm text-amber-800">현장 직원이 신청한 릴스를 편집 중이에요</p>
              </div>
            )}

            {reelStatus === 'done' && reelUrl && (
              <div className="space-y-3">
                <video
                  src={reelUrl}
                  controls
                  playsInline
                  className="w-full rounded-xl aspect-[9/16] bg-black object-contain max-h-80"
                />
                <a
                  href={reelUrl}
                  download
                  className="flex items-center justify-center gap-2 w-full h-11 rounded-lg border border-rose-200 text-rose-700 text-sm font-medium hover:bg-rose-50 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  다운로드 / 공유하기
                </a>
              </div>
            )}

            {reelStatus === 'failed' && (
              <p className="text-sm text-red-600 text-center">
                영상 편집에 실패했어요. 현장 직원에게 다시 신청을 요청해주세요.
              </p>
            )}
          </div>
        )}

        {/* 미리 챙긴 것 · 지켜볼 것 — 문제 생기기 전에 먼저 챙기는 예방 케어 */}
        <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-4 space-y-2">
          <div>
            {/* ⚠️현장 앱(field-report-client)과 같은 칸(preventive_note)이다. 이름·설명·예시를 다르게 두면
                한쪽은 '미리 해준 것'을, 다른 쪽은 '원래 있던 하자'를 적게 되어 같은 절에 성격이 다른 글이 섞인다.
                문구를 고칠 땐 반드시 두 화면을 함께 고칠 것. */}
            <Label className="text-sm font-medium text-emerald-800">하자·특이사항</Label>
            <p className="text-xs text-emerald-700">
              깨진 곳, 원래 있던 흠집, 눈에 띄는 이상을 적어두세요.
              작업 전에 있던 문제를 적어두면 나중에 책임 시비가 안 생기고,
              월간 보고서에 ‘현장에서 확인한 특이사항’으로 실립니다. (선택)
            </p>
          </div>
          <Textarea
            placeholder="예: 거실 창틀에 원래 흠집 있었어요. 3층 탕비실 배수구 물 빠짐이 느립니다."
            value={preventiveNote}
            onChange={(e) => setPreventiveNote(e.target.value)}
            rows={3}
          />
        </div>

        <div className="rounded-xl bg-white border p-4 space-y-3">
          <div>
            <Label className="text-sm font-medium">작업 메모</Label>
            <p className="text-xs text-muted-foreground">간단히 적으면 전문 보고서로 만들어드려요</p>
          </div>

          {!aiReport ? (
            <>
              <Textarea
                placeholder="예: 주방 후드 기름때 제거, 화장실 곰팡이 제거, 창틀·블라인드 먼지 제거"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />

              {/* '앞으로 손봐야 할 것'도 여기서 같이 받는다 — 현장 앱과 같은 자리.
                  카드 밖에 따로 두면 자동으로 정리되는 항목이 아니라 알아서 쓰는 메모처럼 보이고,
                  실제로도 다듬지 않은 채 고객 문서로 나갔다. */}
              <div className="pt-1 border-t">
                <CareAdviceInput value={careAdvice} onChange={setCareAdvice} />
              </div>

              <Button
                variant="outline"
                className="w-full h-11 gap-2"
                disabled={isGenerating || notes.trim().length < 5}
                onClick={() => {
                  // '다시 작성하기'가 쓸 원본을 붙들어 둔다 — notes는 정리된 글로 덮어써진다
                  setRawMemo(notes.trim())
                  generateAi({
                    memo: notes.trim(),
                    serviceItems,
                    careAdvice: careAdvice.trim() || undefined,
                  })
                }}
              >
                <Sparkles className="h-4 w-4" />
                {isGenerating ? '전문 보고서로 정리 중이에요...' : '전문 보고서로 정리하기'}
              </Button>
              {notes.trim().length > 0 && notes.trim().length < 5 && (
                <p className="text-xs text-amber-600 text-center">5자 이상 작성하면 전문 보고서를 만들 수 있어요</p>
              )}
              {notes.trim().length === 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  작업 내용을 간단히 메모하면 전문 보고서로 변환해드려요
                </p>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <AiReportView report={aiReport} />

              {/* 다섯 번째 항목 — 위 네 개와 같은 자리, 같은 방식으로 고친다.
                  값의 주인은 careAdvice 상태다(reports.care_advice로 저장된다). */}
              <CareAdviceBox value={careAdvice} onChange={setCareAdvice} />

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground gap-1.5"
                disabled={isGenerating}
                onClick={() => {
                  const confirmed = window.confirm('보고서를 다시 작성할까요?\n\n현재 보고서 내용이 새로 작성됩니다.')
                  if (!confirmed) return
                  // ⚠️ 예전엔 notes에서 원본 메모를 뽑아내려 했는데 **항상 빈 문자열**이 나왔다.
                  // 정리하고 나면 notes 자체가 '📋 작업 전 상태…'로 통째로 바뀌어서 앞을 잘라내면
                  // 남는 게 없다. 그래서 매번 아래 else로 빠져 '다시 작성하기'가 사실상
                  // '보고서 지우기'로 동작했다. 지우지 말고 있는 재료로 다시 쓴다.
                  const source = rawMemo.trim().length >= 5 ? rawMemo.trim() : aiReport.workDetails
                  generateAi({ memo: source, serviceItems, careAdvice: careAdvice.trim() || undefined })
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isGenerating ? '다시 정리 중이에요...' : '보고서 다시 작성하기'}
              </Button>
            </div>
          )}
        </div>

        {/* 언제쯤 다시 연락할지 — 위에서 '앞으로 손봐야 할 것'을 적었을 때만 뜬다.
            입력칸은 위 보고서 카드 안에 있으므로 여기서는 감춘다(hideAdvice). */}
        <div className="rounded-xl bg-white border p-4">
          <CareAdviceField
            advice={careAdvice}
            months={careMonths}
            onAdviceChange={setCareAdvice}
            onMonthsChange={setCareMonths}
            hideAdvice
          />
        </div>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 pb-safe space-y-2">
        {!savedReportId ? (
          <Button
            size="lg"
            className="w-full h-14 text-base gap-2"
            disabled={isSaving || isUploading}
            onClick={handleSave}
          >
            <Save className="h-5 w-5" />
            {isSaving ? '저장 중...' : '보고서 저장하기'}
          </Button>
        ) : (
          <>
            {/* 정기 거래처엔 방문마다 보내지 않는다 — 월간 보고서로 한 번에 안내한다 */}
            {booking.contractId ? (
              <p className="text-sm text-muted-foreground text-center bg-muted/40 border border-border rounded-lg px-3 py-3">
                정기 거래처라 방문마다 보내지 않아요.
                <br />
                여기 쓴 내용과 사진은 <b>월간 보고서</b>에 자동으로 들어가요.
              </p>
            ) : (
            <Button
              size="lg"
              className="w-full h-14 text-base gap-2"
              variant={alreadySent ? 'outline' : 'default'}
              disabled={!booking.customerPhone || !canSend || isSending}
              onClick={handleSend}
            >
              <Send className="h-5 w-5" />
              {isSending ? '발송 중...' : alreadySent ? '고객에게 다시 보내기' : '고객에게 보고서 발송하기'}
            </Button>
            )}
            {!booking.contractId && !canSend && (
              <p className="text-xs text-amber-700 text-center bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                아직 시작하지 않은 일정이에요. 작업을 마치고 <b>완료 처리</b>한 뒤에 보낼 수 있어요.
                <br />
                지금 쓴 내용은 저장해두면 그대로 남아요.
              </p>
            )}
            {!booking.contractId && canSend && !booking.customerPhone && (
              <p className="text-xs text-muted-foreground text-center">고객 연락처가 없어 알림톡을 보낼 수 없어요</p>
            )}
            <Button
              variant="outline"
              className="w-full h-10 text-sm"
              disabled={isSaving || isUploading}
              onClick={handleSave}
            >
              {isSaving ? '저장 중...' : '사진/메모 수정 후 다시 저장'}
            </Button>
            {!alreadySent && (
              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline underline-offset-2 py-1 hover:text-foreground transition-colors"
                disabled={isSkipping}
                onClick={() => {
                  const confirmed = window.confirm(
                    '이 고객에게 보고서를 발송하지 않을까요?\n\n발송 목록에서 사라지고, 나중에 다시 보낼 수 있어요.'
                  )
                  if (!confirmed) return
                  skipSend({ reportId: savedReportId! })
                }}
              >
                {isSkipping ? '처리 중...' : '이 고객은 발송 안 할래요'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
