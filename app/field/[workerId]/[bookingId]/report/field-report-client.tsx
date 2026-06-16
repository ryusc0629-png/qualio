'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { fieldSaveReportAction, fieldSendReportAction, fieldGenerateAiReportAction } from '@/lib/actions/field'
import {
  ArrowLeft,
  Camera,
  X,
  Upload,
  Send,
  CheckCircle2,
  Save,
  Sparkles,
} from 'lucide-react'

type PhotoSlot = { url: string; uploading: boolean }

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
  const [aiReport, setAiReport] = useState<AiReportData | null>(null)

  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)

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

  // AI 보고서 생성
  const { execute: generateAi, isPending: isGenerating } = useAction(fieldGenerateAiReportAction, {
    onSuccess: ({ data }) => {
      if (data?.report) {
        setAiReport(data.report)
        // AI 결과를 메모에 반영
        const recSection = data.report.recommendedServices.length > 0
          ? `\n\n💡 추천 서비스\n${data.report.recommendedServices.join(', ')}`
          : ''
        const formatted = `📋 작업 전 상태\n${data.report.beforeStatus}\n\n🔧 작업 내용\n${data.report.workDetails}\n\n✨ 작업 결과\n${data.report.afterResult}\n\n📌 참고사항\n${data.report.additionalNotes}${recSection}`
        setNotes(formatted)
        toast.success('AI 보고서가 작성됐어요!')
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'AI 작성에 실패했어요. 다시 시도해주세요'),
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
    saveReport({
      workerId,
      bookingId: booking.id,
      notes: notes.trim() || undefined,
      beforePhotoUrls: before.filter((p) => !p.uploading && p.url).map((p) => p.url),
      afterPhotoUrls: after.filter((p) => !p.uploading && p.url).map((p) => p.url),
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

  // 추천 서비스의 가격 정보 매칭
  const getServicePrice = (serviceName: string) =>
    serviceItems.find((s) => s.name === serviceName)

  // AI 보고서 표시 컴포넌트
  const AiReportView = ({ report }: { report: AiReportData }) => (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 space-y-1">
        <p className="text-xs font-semibold text-amber-800">작업 전 상태</p>
        <p className="text-sm text-amber-900">{report.beforeStatus}</p>
      </div>
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-1">
        <p className="text-xs font-semibold text-blue-800">작업 내용</p>
        <p className="text-sm text-blue-900">{report.workDetails}</p>
      </div>
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 space-y-1">
        <p className="text-xs font-semibold text-emerald-800">작업 결과</p>
        <p className="text-sm text-emerald-900">{report.afterResult}</p>
      </div>
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1">
        <p className="text-xs font-semibold text-gray-700">참고사항</p>
        <p className="text-sm text-gray-800">{report.additionalNotes}</p>
      </div>
      {report.recommendedServices.length > 0 && (
        <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 space-y-2">
          <p className="text-xs font-semibold text-violet-800">추천 서비스</p>
          <div className="space-y-1.5">
            {report.recommendedServices.map((name) => {
              const svc = getServicePrice(name)
              return (
                <div key={name} className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-violet-100">
                  <span className="text-sm font-medium text-violet-900">{name}</span>
                  {svc && (
                    <span className="text-xs text-violet-600">{svc.basePrice.toLocaleString()}원~</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  // --- 이미 발송된 경우 ---
  if (alreadySent) {
    return (
      <div className="min-h-dvh bg-gray-50">
        <div className="bg-white border-b px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
          <Link href={`/field/${workerId}/${booking.id}`} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-bold">작업 완료 보고서</h1>
        </div>

        <div className="px-4 py-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <div>
            <p className="font-bold text-lg">보고서 발송 완료</p>
            <p className="text-sm text-muted-foreground mt-1">
              {booking.customerName} 고객님에게 카카오 알림톡으로 보고서가 발송됐어요
            </p>
          </div>
          <Link href={`/field/${workerId}/${booking.id}`}>
            <Button variant="outline" className="h-12 mt-4">
              작업 상세로 돌아가기
            </Button>
          </Link>
        </div>
      </div>
    )
  }

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

          <Textarea
            placeholder="예: 주방 기름때 심함, 화장실 곰팡이 제거, 후드 필터 교체 필요"
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setAiReport(null) }}
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

          {/* AI 결과 미리보기 */}
          {aiReport && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-primary">AI 보고서 미리보기</p>
              <AiReportView report={aiReport} />
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
            disabled={isSaving || isUploading || !hasPhotos}
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
          <p className="text-xs text-muted-foreground text-center">사진을 1장 이상 추가해주세요</p>
        )}
      </div>
    </div>
  )
}
