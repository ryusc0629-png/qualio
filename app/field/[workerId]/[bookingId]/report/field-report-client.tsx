'use client'

import { useState, useRef, useEffect } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { fieldSaveReportAction, fieldSendReportAction, fieldGenerateAiReportAction, fieldSaveWorkClipsAction, fieldRequestReelAction, fieldGetReelStatusAction } from '@/lib/actions/field'
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
  Video,
  Film,
  Loader2,
} from 'lucide-react'

type PhotoSlot = { url: string; uploading: boolean }
type VideoSlot = { url: string; uploading: boolean; thumbnailUrl?: string }

interface BookingInfo {
  id: string
  customerName: string
  customerPhone: string | null
  serviceAddress: string | null
  scheduledAt: string
}

interface ExistingReport {
  id: string
  notes: string | null
  sentAt: string | null
  beforeUrls: string[]
  afterUrls: string[]
  aiReportData: AiReportData | null
  workClipUrls: string[]
  reelStatus: string
  reelUrl: string | null
}

interface AiReportData {
  beforeStatus: string
  workDetails: string
  afterResult: string
  additionalNotes: string
  recommendedServices: string[]
}

interface ServiceItem {
  name: string
  basePrice: number
}

interface Props {
  workerId: string
  businessId: string
  booking: BookingInfo
  existingReport: ExistingReport | null
  serviceItems: ServiceItem[]
}

export function FieldReportClient({ workerId, businessId, booking, existingReport, serviceItems }: Props) {
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
  const [clips, setClips] = useState<VideoSlot[]>(
    existingReport?.workClipUrls.map((url) => ({ url, uploading: false })) ?? []
  )
  const [clipsSaved, setClipsSaved] = useState(
    (existingReport?.workClipUrls.length ?? 0) >= 3
  )
  const [reelStatus, setReelStatus] = useState(existingReport?.reelStatus ?? 'idle')
  const [reelUrl, setReelUrl] = useState<string | null>(existingReport?.reelUrl ?? null)
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    new Set(existingReport?.aiReportData?.recommendedServices ?? [])
  )
  const [showServicePicker, setShowServicePicker] = useState(false)

  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)
  const clipRef0 = useRef<HTMLInputElement>(null)
  const clipRef1 = useRef<HTMLInputElement>(null)
  const clipRef2 = useRef<HTMLInputElement>(null)
  const clipRefs = [clipRef0, clipRef1, clipRef2] as const

  const isUploading = before.some((p) => p.uploading) || after.some((p) => p.uploading)
  const hasPhotos = before.some((p) => !p.uploading && p.url) || after.some((p) => !p.uploading && p.url)

  // 보고서 저장
  const { execute: saveReport, isPending: isSaving } = useAction(fieldSaveReportAction, {
    onSuccess: ({ data }) => {
      if (data?.reportId) setSavedReportId(data.reportId)
      toast.success('보고서가 저장됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 보고서 발송
  const { execute: sendReport, isPending: isSending } = useAction(fieldSendReportAction, {
    onSuccess: () => {
      setAlreadySent(true)
      toast.success('고객에게 보고서가 발송됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // AI 포맷된 notes 텍스트 생성 헬퍼
  const formatAiNotes = (report: AiReportData, services: Set<string>) => {
    const recSection = report.recommendedServices.filter(s => services.has(s)).length > 0
      ? `\n\n💡 추천 서비스\n${report.recommendedServices.filter(s => services.has(s)).join(', ')}`
      : ''
    return `📋 작업 전 상태\n${report.beforeStatus}\n\n🔧 작업 내용\n${report.workDetails}\n\n✨ 작업 결과\n${report.afterResult}\n\n📌 참고사항\n${report.additionalNotes}${recSection}`
  }

  // AI 보고서 생성
  const { execute: generateAi, isPending: isGenerating } = useAction(fieldGenerateAiReportAction, {
    onSuccess: ({ data }) => {
      if (data?.report) {
        const newServices = new Set(data.report.recommendedServices)
        setAiReport(data.report)
        setSelectedServices(newServices)
        const formatted = formatAiNotes(data.report, newServices)
        setNotes(formatted)
        toast.success('AI 보고서가 작성됐어요!')

        // AI 보고서 생성 즉시 자동 저장 (API 비용 낭비 방지)
        saveReport({
          workerId,
          bookingId: booking.id,
          notes: formatted,
          beforePhotoUrls: before.filter((p) => !p.uploading && p.url).map((p) => p.url),
          afterPhotoUrls: after.filter((p) => !p.uploading && p.url).map((p) => p.url),
          aiReportData: data.report,
        })
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'AI 작성에 실패했어요. 다시 시도해주세요'),
  })

  // 작업 중 영상 클립 저장 (업로드 완료 시 자동 호출)
  const { execute: saveClips } = useAction(fieldSaveWorkClipsAction, {
    onSuccess: () => setClipsSaved(true),
    onError: () => toast.error('영상 저장에 실패했어요. 페이지를 나가기 전에 다시 시도해주세요'),
  })

  // 릴스 편집 요청
  const { execute: requestReel, isPending: isRequestingReel } = useAction(fieldRequestReelAction, {
    onSuccess: () => {
      setReelStatus('processing')
      toast.success('릴스 편집을 요청했어요! 완성되면 사장님께 알려드려요.')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 릴스 상태 조회 (처리 중일 때 폴링) — 완성되면 자동으로 '완료'로 전환
  const { execute: checkReelStatus } = useAction(fieldGetReelStatusAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      if (data.reelStatus === 'done' && data.reelUrl) {
        setReelStatus('done')
        setReelUrl(data.reelUrl)
      } else if (data.reelStatus === 'failed') {
        setReelStatus('failed')
      }
    },
  })

  // '처리 중' 상태면 5초마다 완성 여부 확인 (웹훅이 DB를 갱신하면 감지)
  useEffect(() => {
    if (reelStatus !== 'processing' || !savedReportId) return
    checkReelStatus({ workerId, reportId: savedReportId })  // 진입 즉시 1회
    const interval = setInterval(() => {
      checkReelStatus({ workerId, reportId: savedReportId })
    }, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelStatus, savedReportId])

  // 로컬 파일에서 첫 프레임 썸네일 추출
  const extractThumbnail = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.src = objectUrl
      video.muted = true
      video.playsInline = true
      video.currentTime = 0.5
      const capture = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 320
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.drawImage(video, 0, 0, 320, 320)
        URL.revokeObjectURL(objectUrl)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      video.addEventListener('seeked', capture, { once: true })
      video.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl)
        resolve('')
      }, { once: true })
      video.load()
    })

  // 영상 클립 업로드 (한 번에 하나씩, 슬롯 인덱스 지정)
  const uploadClip = async (file: File, index: number) => {
    // 파일 크기 사전 체크 (200MB 초과 시 거부)
    const MAX_MB = 200
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`영상 파일이 너무 커요 (최대 ${MAX_MB}MB). 짧게 찍거나 해상도를 낮춰서 다시 올려주세요`)
      return
    }

    // 업로드 전 로컬에서 썸네일 추출
    const thumbnailUrl = await extractThumbnail(file)

    const resetSlot = () =>
      setClips((prev) => {
        const next = [...prev]
        next[index] = { url: '', uploading: false, thumbnailUrl: undefined }
        return next
      })

    const ext = file.name.split('.').pop() ?? 'mp4'
    const path = `${businessId}/${booking.id}/clips/clip${index + 1}-${Date.now()}.${ext}`

    setClips((prev) => {
      const next = [...prev]
      next[index] = { url: '', uploading: true, thumbnailUrl }
      return next
    })

    try {
      const supabase = createClient()
      const { error } = await supabase.storage.from('report-photos').upload(path, file, { upsert: true })

      if (error) {
        console.error('[FieldReport] 영상 업로드 오류:', error)
        const msg = error.message?.includes('exceeded')
          ? '영상이 너무 커요. 더 짧게 찍어서 올려주세요'
          : '영상 업로드에 실패했어요. 다시 시도해주세요'
        toast.error(msg)
        resetSlot()
        return
      }

      const { data: { publicUrl } } = supabase.storage.from('report-photos').getPublicUrl(path)

      setClips((prev) => {
        const next = [...prev]
        next[index] = { url: publicUrl, uploading: false, thumbnailUrl }

        // 업로드 완료 즉시 DB 자동 저장 (보고서 미저장 상태에서도 동작)
        const urls = next.filter((c) => c.url && !c.uploading).map((c) => c.url)
        if (urls.length >= 1) {
          saveClips({
            workerId,
            bookingId: booking.id,
            clipUrls: urls as [string, ...string[]],
          })
        }

        return next
      })
      setClipsSaved(false)
    } catch (err) {
      console.error('[FieldReport] 영상 업로드 예외:', err)
      toast.error('영상 업로드에 실패했어요. 다시 시도해주세요')
      resetSlot()
    }
  }

  // 영상 클립 삭제
  const removeClip = (index: number) => {
    setClips((prev) => {
      const next = [...prev]
      next[index] = { url: '', uploading: false }
      return next
    })
    setClipsSaved(false)
  }

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
      workerId,
      bookingId: booking.id,
      notes: notes.trim() || undefined,
      beforePhotoUrls: before.filter((p) => !p.uploading && p.url).map((p) => p.url),
      afterPhotoUrls: after.filter((p) => !p.uploading && p.url).map((p) => p.url),
      aiReportData: aiReport ? {
        ...aiReport,
        // 선택된 서비스만 저장
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
    sendReport({
      workerId,
      bookingId: booking.id,
      reportId: savedReportId,
    })
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

  // 추천 서비스의 가격 정보 매칭
  const getServicePrice = (serviceName: string) =>
    serviceItems.find((s) => s.name === serviceName)

  // 추천 서비스 선택/해제 토글
  const toggleService = (name: string) => {
    const next = new Set(selectedServices)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedServices(next)
    if (aiReport) {
      // aiReport.recommendedServices에 없는 수동 추가 서비스도 포함
      const updated = { ...aiReport, recommendedServices: Array.from(new Set([...aiReport.recommendedServices, ...next])) }
      setAiReport(updated)
      setNotes(formatAiNotes(updated, next))
    }
  }

  // 서비스 직접 추가
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

  // 추가 가능한 서비스 목록 (이미 추천 목록에 있는 것 제외)
  const availableServices = serviceItems.filter(
    (s) => !aiReport?.recommendedServices.includes(s.name)
  )

  // AI 보고서 섹션 수정
  const updateAiField = (field: keyof Omit<AiReportData, 'recommendedServices'>, value: string) => {
    if (!aiReport) return
    const updated = { ...aiReport, [field]: value }
    setAiReport(updated)
    setNotes(formatAiNotes(updated, selectedServices))
  }

  // 편집 가능한 보고서 섹션
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

  // AI 보고서 표시 컴포넌트
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
        {/* 서비스 직접 추가 */}
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

  // --- 보고서 작성 화면 ---
  return (
    <div className="min-h-dvh bg-gray-50 pb-40">
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
        <Link href={`/field/${workerId}/${booking.id}`} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-bold">작업 완료 보고서</h1>
          <p className="text-xs text-muted-foreground">{booking.customerName} · {date}</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* 발송 완료 배너 */}
        {alreadySent && (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">보고서 발송 완료</p>
              <p className="text-xs text-emerald-600">수정 후 다시 저장하면 고객 보고서에 바로 반영돼요</p>
            </div>
          </div>
        )}
        {/* Before 사진 */}
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

        {/* 릴스용 작업 중 영상 — 항상 표시, 저장 버튼은 보고서 저장 후 활성화 */}
        <div className="rounded-xl bg-white border p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-rose-500" />
              <Label className="text-sm font-medium">작업 중 촬영한 영상 (선택)</Label>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              찍어둔 영상 3컷을 올려두세요 — 나중에 버튼 하나로 릴스가 완성돼요
            </p>
          </div>

          {/* 3개 영상 슬롯 */}
          <div className="grid grid-cols-3 gap-2">
            {([0, 1, 2] as const).map((idx) => {
              const slot = clips[idx]
              const isClipUploading = slot?.uploading ?? false
              const hasVideo = !isClipUploading && !!slot?.url
              return (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <p className="text-[10px] text-muted-foreground font-medium">장면 {idx + 1}</p>
                  <div className="relative w-full aspect-square">
                    <button
                      type="button"
                      onClick={() => clipRefs[idx].current?.click()}
                      className={`w-full h-full rounded-xl border-2 overflow-hidden flex flex-col items-center justify-center gap-1 transition-colors ${
                        hasVideo
                          ? 'border-emerald-400'
                          : 'border-dashed border-gray-300 hover:border-rose-300 hover:bg-rose-50/30'
                      }`}
                    >
                      {isClipUploading ? (
                        slot?.thumbnailUrl ? (
                          // 업로드 중에도 썸네일 미리보기 + 스피너 오버레이
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={slot.thumbnailUrl} alt="" className="w-full h-full object-cover opacity-50" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 rounded-xl">
                              <Loader2 className="h-5 w-5 text-white animate-spin" />
                              <span className="text-[10px] text-white font-medium">올리는 중</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                            <span className="text-[10px] text-muted-foreground">올리는 중</span>
                          </>
                        )
                      ) : hasVideo ? (
                        slot?.thumbnailUrl ? (
                          // 썸네일 + 완료 배지
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={slot.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 flex items-center justify-center py-1 rounded-b-xl">
                              <span className="text-[10px] text-white font-medium">탭해서 교체</span>
                            </div>
                          </>
                        ) : (
                          // 기존 저장된 영상 (썸네일 없음) → video 태그 폴백
                          <>
                            <video src={slot.url} className="w-full h-full object-cover" preload="metadata" />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 flex items-center justify-center py-1 rounded-b-xl">
                              <span className="text-[10px] text-white font-medium">탭해서 교체</span>
                            </div>
                          </>
                        )
                      ) : (
                        <>
                          <Video className="h-5 w-5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">영상 올리기</span>
                        </>
                      )}
                    </button>
                    {hasVideo && (
                      <button
                        type="button"
                        onClick={() => removeClip(idx)}
                        className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 z-10"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    )}
                  </div>
                  <input
                    ref={clipRefs[idx]}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadClip(file, idx)
                      e.target.value = ''
                    }}
                  />
                </div>
              )
            })}
          </div>

          {/* 릴스 요청 버튼 */}
          {!savedReportId ? (
            <p className="text-xs text-muted-foreground text-center">
              아래에서 보고서를 먼저 저장하면 릴스를 만들 수 있어요
            </p>
          ) : reelStatus === 'idle' || reelStatus === 'failed' ? (
            <div className="space-y-2">
              {clipsSaved ? (
                <Button
                  className="w-full h-12 gap-2 bg-rose-500 hover:bg-rose-600 text-white"
                  disabled={isRequestingReel}
                  onClick={() =>
                    requestReel({ workerId, bookingId: booking.id, reportId: savedReportId })
                  }
                >
                  <Film className="h-4 w-4" />
                  {isRequestingReel ? '요청 중...' : '릴스 자동 편집 신청하기'}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  {clips.filter((c) => c.url && !c.uploading).length > 0
                    ? `영상 ${clips.filter((c) => c.url && !c.uploading).length}개 저장됨 — 3개를 모두 올리면 릴스를 만들 수 있어요`
                    : '영상 3개를 모두 올리면 릴스를 만들 수 있어요'}
                </p>
              )}
              {reelStatus === 'failed' && (
                <p className="text-xs text-rose-600 text-center">편집에 실패했어요. 다시 신청해주세요</p>
              )}
            </div>
          ) : reelStatus === 'processing' ? (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 border border-amber-100 p-3">
              <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
              <p className="text-sm text-amber-800 font-medium">편집 중이에요 — 완성되면 사장님께 알려드려요</p>
            </div>
          ) : reelStatus === 'done' && reelUrl ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">릴스 완성됐어요!</p>
              </div>
              <a
                href={reelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center text-sm text-emerald-700 underline"
              >
                영상 보기 / 다운로드
              </a>
            </div>
          ) : null}
        </div>

        {/* After 사진 */}
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

        {/* 메모 + AI 작성 */}
        <div className="rounded-xl bg-white border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">작업 메모</Label>
              <p className="text-xs text-muted-foreground">간단히 적으면 AI가 전문 보고서로 만들어드려요</p>
            </div>
          </div>

          {/* AI 보고서가 없을 때: 메모 입력 + 생성 버튼 */}
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
                onClick={() => generateAi({ workerId, memo: notes.trim(), serviceItems })}
              >
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'AI가 작성 중이에요...' : 'AI로 전문 보고서 작성하기'}
              </Button>

              {notes.trim().length > 0 && notes.trim().length < 5 && (
                <p className="text-xs text-amber-600 text-center">5자 이상 작성하면 AI 보고서를 만들 수 있어요</p>
              )}
              {notes.trim().length === 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  작업 내용을 간단히 메모하면 AI가 전문 보고서로 변환해드려요
                </p>
              )}
            </>
          ) : (
            /* AI 보고서가 있을 때: 결과 표시 + 재작성 버튼 */
            <div className="space-y-3">
              <AiReportView report={aiReport} />
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground gap-1.5"
                disabled={isGenerating}
                onClick={() => {
                  const confirmed = window.confirm('AI 보고서를 다시 작성할까요?\n\n현재 보고서 내용이 새로 작성됩니다.')
                  if (!confirmed) return
                  // 원본 메모 추출 (AI 포맷팅 전 텍스트)
                  const rawMemo = notes.replace(/📋 작업 전 상태\n[\s\S]*$/, '').trim()
                  if (rawMemo.length >= 5) {
                    generateAi({ workerId, memo: rawMemo, serviceItems })
                  } else {
                    // 메모가 너무 짧으면 AI 보고서 초기화해서 메모 입력 모드로 전환
                    setAiReport(null)
                    setSelectedServices(new Set())
                    setNotes('')
                  }
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isGenerating ? 'AI가 재작성 중이에요...' : 'AI 보고서 다시 작성하기'}
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
        ) : alreadySent ? (
          <>
            <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 h-14">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span className="text-sm font-semibold text-emerald-800">보고서 발송 완료</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-10 text-sm"
                disabled={isSaving || isUploading}
                onClick={handleSave}
              >
                {isSaving ? '저장 중...' : '수정 후 다시 저장'}
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-10 text-sm gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                disabled={!booking.customerPhone || isSending}
                onClick={handleSend}
              >
                <Send className="h-3.5 w-3.5" />
                {isSending ? '발송 중...' : '다시 발송하기'}
              </Button>
            </div>
            {!booking.customerPhone && (
              <p className="text-xs text-muted-foreground text-center">고객 연락처가 없어 알림톡을 보낼 수 없어요</p>
            )}
          </>
        ) : (
          <>
            <Button
              size="lg"
              className="w-full h-14 text-base gap-2"
              disabled={!booking.customerPhone || isSending}
              onClick={handleSend}
            >
              <Send className="h-5 w-5" />
              {isSending ? '발송 중...' : '고객에게 보고서 발송하기'}
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
          </>
        )}

        {!hasPhotos && !savedReportId && (
          <p className="text-xs text-muted-foreground text-center">사진 없이도 저장할 수 있어요</p>
        )}
      </div>
    </div>
  )
}
