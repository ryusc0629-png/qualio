'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { saveReportAction, ownerSendReportAction, ownerGenerateAiReportAction, skipReportSendAction } from '@/lib/actions/reports'
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
} from 'lucide-react'

type PhotoSlot = { url: string; uploading: boolean }

interface BookingInfo {
  id: string
  customerName: string
  customerPhone: string | null
  serviceAddress: string | null
  scheduledAt: string
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
  sentAt: string | null
  beforeUrls: string[]
  afterUrls: string[]
  aiReportData: AiReportData | null
  reelStatus: string
  reelUrl: string | null
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
  const [before, setBefore] = useState<PhotoSlot[]>(
    existingReport?.beforeUrls.map((url) => ({ url, uploading: false })) ?? []
  )
  const [after, setAfter] = useState<PhotoSlot[]>(
    existingReport?.afterUrls.map((url) => ({ url, uploading: false })) ?? []
  )
  const [savedReportId, setSavedReportId] = useState<string | null>(existingReport?.id ?? null)
  const [alreadySent, setAlreadySent] = useState(!!existingReport?.sentAt)
  const [aiReport, setAiReport] = useState<AiReportData | null>(existingReport?.aiReportData ?? null)
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    new Set(existingReport?.aiReportData?.recommendedServices ?? [])
  )
  const [showServicePicker, setShowServicePicker] = useState(false)

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
        const newServices = new Set(data.report.recommendedServices)
        setAiReport(data.report)
        setSelectedServices(newServices)
        const formatted = formatAiNotes(data.report, newServices)
        setNotes(formatted)
        toast.success('전문 보고서가 작성됐어요!')

        // AI 생성 즉시 자동 저장 (API 비용 낭비 방지)
        saveReport({
          bookingId:       booking.id,
          notes:           formatted,
          beforePhotoUrls: before.filter((p) => !p.uploading && p.url).map((p) => p.url),
          afterPhotoUrls:  after.filter((p) => !p.uploading && p.url).map((p) => p.url),
          sendAlimtalk:    false,
          aiReportData:    data.report,
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
    const remaining = 5 - slots.length
    if (remaining <= 0) {
      toast.error('사진은 최대 5장까지 등록할 수 있어요')
      return
    }
    const toUpload = Array.from(files).slice(0, remaining)
    const placeholders = toUpload.map(() => ({ url: '', uploading: true }))
    setSlots((prev) => [...prev, ...placeholders])

    const supabase = createClient()
    const uploaded: string[] = []

    for (const file of toUpload) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${businessId}/${booking.id}/${type}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('report-photos').upload(path, file, { upsert: true })
      if (error) {
        toast.error('사진 업로드에 실패했어요')
        continue
      }
      const { data: { publicUrl } } = supabase.storage.from('report-photos').getPublicUrl(path)
      uploaded.push(publicUrl)
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
      beforePhotoUrls: before.filter((p) => !p.uploading && p.url).map((p) => p.url),
      afterPhotoUrls:  after.filter((p) => !p.uploading && p.url).map((p) => p.url),
      sendAlimtalk:    false,
      aiReportData: aiReport ? {
        ...aiReport,
        recommendedServices: aiReport.recommendedServices.filter((s) => selectedServices.has(s)),
      } : undefined,
    })
  }

  const handleSend = () => {
    if (!savedReportId) return
    const confirmed = window.confirm(
      '보고서를 검토하셨나요?\n\n고객에게 카카오 알림톡으로 보고서가 발송됩니다.'
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
        {slots.length < 5 && (
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

        <div className="rounded-xl bg-white border p-4 space-y-3">
          <div>
            <Label className="text-sm font-medium">작업 메모</Label>
            <p className="text-xs text-muted-foreground">간단히 적으면 전문 보고서로 만들어드려요</p>
          </div>

          {!aiReport ? (
            <>
              <Textarea
                placeholder="예: 주방 기름때 심함, 화장실 곰팡이 제거, 후드 필터 교체 필요"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
              <Button
                variant="outline"
                className="w-full h-11 gap-2"
                disabled={isGenerating || notes.trim().length < 5}
                onClick={() => generateAi({ memo: notes.trim(), serviceItems })}
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
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground gap-1.5"
                disabled={isGenerating}
                onClick={() => {
                  const confirmed = window.confirm('보고서를 다시 작성할까요?\n\n현재 보고서 내용이 새로 작성됩니다.')
                  if (!confirmed) return
                  const rawMemo = notes.replace(/📋 작업 전 상태\n[\s\S]*$/, '').trim()
                  if (rawMemo.length >= 5) {
                    generateAi({ memo: rawMemo, serviceItems })
                  } else {
                    setAiReport(null)
                    setSelectedServices(new Set())
                    setNotes('')
                  }
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isGenerating ? '다시 정리 중이에요...' : '보고서 다시 작성하기'}
              </Button>
            </div>
          )}
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
            <Button
              size="lg"
              className="w-full h-14 text-base gap-2"
              disabled={!booking.customerPhone || isSending || alreadySent}
              onClick={handleSend}
            >
              <Send className="h-5 w-5" />
              {isSending ? '발송 중...' : alreadySent ? '발송 완료' : '고객에게 보고서 발송하기'}
            </Button>
            {!booking.customerPhone && (
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
