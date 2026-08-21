'use client'

import { useState, useRef, useEffect } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { compressImage, mapWithConcurrency } from '@/lib/upload/image'
import { readVideoMeta, checkVideo, compressVideo } from '@/lib/upload/video'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CareAdviceField, CareAdviceInput } from '@/components/dashboard/care-advice-field'
import { SiteIssueSection } from '@/components/field/site-issue-section'
import { createClient } from '@/lib/supabase/client'
import { REPORT_PHOTO_MAX } from '@/lib/config/photos'
import { fieldSaveReportAction, fieldSendReportAction, fieldGenerateAiReportAction, fieldSaveWorkClipsAction, fieldSaveMemoAction } from '@/lib/actions/field'
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
  ChevronDown,
} from 'lucide-react'

// 현장 순서대로 번호를 붙인다 — 작업 전 사진 → 하자 기록 → 작업 중 영상 → 작업 후 사진 → 마무리.
// 현장 직원은 화면을 위에서부터 훑기 때문에, 번호가 있으면 '어디까지 했는지'를 안 헷갈린다.
const STEP_LABELS = ['작업 전', '하자 기록', '작업 중 영상', '작업 후', '마무리'] as const

/**
 * 정리된 보고서 안의 '앞으로 손봐야 할 것' 칸.
 *
 * 위 네 항목과 나란히 두는 이유: 이 글도 똑같이 자동으로 다듬어져 고객 문서에 실린다.
 * 카드 밖에 빈 칸으로 떨어져 있으면 "이건 내가 알아서 쓰는 메모"로 읽히고,
 * 실제로도 현장이 쓴 메모체("~해 보임")가 그대로 거래처 서류에 나갔다.
 *
 * 값의 주인은 reports.care_advice 컬럼이다(ai_report_data가 아니다) —
 * 고객 문서의 '향후 관리 안내'와 홍보 영상 대본이 그 컬럼을 읽는다.
 */
function CareAdviceBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 space-y-1">
      <p className="text-xs font-semibold text-orange-800">앞으로 손봐야 할 것</p>
      {editing ? (
        <textarea
          className="w-full text-sm text-orange-900 bg-transparent border-none outline-none resize-none"
          value={value}
          rows={3}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <p
          className={`text-sm cursor-pointer hover:opacity-70 ${value ? 'text-orange-900' : 'text-orange-900/50'}`}
          onClick={() => setEditing(true)}
        >
          {value || '지금은 괜찮지만 나중에 문제가 될 부분이 있으면 탭해서 적어주세요'}
        </p>
      )}
    </div>
  )
}

function StepBadge({ n }: { n: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center shrink-0">
        {n}
      </span>
      <span className="text-[11px] font-semibold text-primary tracking-wide">{STEP_LABELS[n - 1]}</span>
    </div>
  )
}

// caption = 이 사진이 '어디'인지. 초도(첫) 방문에서는 직원이 반드시 적는다 —
// 사장님은 현장에 안 가므로 위치를 알 방법이 없고, 위치가 없으면 거래처에 보낼
// 초도 보고서를 만들 수 없다.
type PhotoSlot = { url: string; uploading: boolean; caption?: string }

// 작업 전·후 각각 올릴 수 있는 장수. 대청소 현장은 5장으로 모자란다.
// 이 사진이 그대로 시공사례 글로 넘어가므로 상한은 lib/config/photos.ts 한 곳에서 정한다.
const MAX_PHOTOS = REPORT_PHOTO_MAX
type VideoSlot = { url: string; uploading: boolean; thumbnailUrl?: string; duration?: number; shrinkPercent?: number }

interface BookingInfo {
  id: string
  customerName: string
  customerPhone: string | null
  serviceAddress: string | null
  scheduledAt: string
  /** 정기계약 방문이면 계약 id — 정기 거래처엔 방문마다 보고서를 보내지 않는다 */
  contractId: string | null
  /** 이 계약의 첫 방문인지 — 여기 쓴 기록이 초도 리포트 초안이 된다 */
  isFirstVisit: boolean
}

interface ExistingReport {
  id: string
  notes: string | null
  preventiveNote: string | null
  careAdvice: string | null
  careMonths: number
  sentAt: string | null
  beforeUrls: { url: string; caption: string }[]
  afterUrls: { url: string; caption: string }[]
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
  /** 현장에서 고객이 추가로 부탁한 것 (bookings.customer_request) */
  existingCustomerRequest: string
  /** 다음에 올 직원이 알아야 할 것 (customers.notes에 오늘 날짜로 쌓임) */
  existingNextVisitNote: string
  /** 이미 골라둔 '다음에 제안할 서비스' */
  existingSuggestions?: string[]
}

export function FieldReportClient({ workerId, businessId, booking, existingReport, serviceItems, existingCustomerRequest, existingNextVisitNote, existingSuggestions = [] }: Props) {
  const [notes, setNotes] = useState(existingReport?.notes ?? '')
  // 현장 특이사항 — 오늘 눈에 띈 것. 월말에 거래처 보고서로 자동으로 모인다.
  const [preventiveNote, setPreventiveNote] = useState(existingReport?.preventiveNote ?? '')
  const [before, setBefore] = useState<PhotoSlot[]>(
    existingReport?.beforeUrls.map((p) => ({ url: p.url, caption: p.caption, uploading: false })) ?? []
  )
  const [after, setAfter] = useState<PhotoSlot[]>(
    existingReport?.afterUrls.map((p) => ({ url: p.url, caption: p.caption, uploading: false })) ?? []
  )
  // 앞으로 손봐야 할 것 — 그 시점이 되면 사장님께 알림이 간다
  const [careAdvice, setCareAdvice] = useState(existingReport?.careAdvice ?? '')
  const [careMonths, setCareMonths] = useState(existingReport?.careMonths ?? 6)
  // 다음에 제안할 서비스 — 고객에게 지금 나가지 않고, 대표가 승인하면 careMonths 뒤에 연락된다
  const [suggestedServices, setSuggestedServices] = useState<string[]>(existingSuggestions)
  const [savedReportId, setSavedReportId] = useState<string | null>(existingReport?.id ?? null)
  const [alreadySent, setAlreadySent] = useState(!!existingReport?.sentAt)
  const [aiReport, setAiReport] = useState<AiReportData | null>(existingReport?.aiReportData ?? null)
  const [clips, setClips] = useState<VideoSlot[]>(
    existingReport?.workClipUrls.map((url) => ({ url, uploading: false })) ?? []
  )
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    new Set(existingReport?.aiReportData?.recommendedServices ?? [])
  )
  const [showServicePicker, setShowServicePicker] = useState(false)
  // 예전엔 '현장 메모 작성'이 작업 상세에 따로 있었다 — 같은 사진·같은 특이사항을 두 화면에서
  // 두 번 물어보는 꼴이라 여기로 합쳤다. 저장은 보고서 저장 버튼 한 번으로 같이 나간다.
  const [customerRequest, setCustomerRequest] = useState(existingCustomerRequest)
  const [nextVisitNote, setNextVisitNote] = useState(existingNextVisitNote)
  const [extrasOpen, setExtrasOpen] = useState(
    !!existingCustomerRequest || !!existingNextVisitNote
  )

  const memoRef = useRef<HTMLTextAreaElement>(null)
  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)
  const clipRef0 = useRef<HTMLInputElement>(null)
  const clipRef1 = useRef<HTMLInputElement>(null)
  const clipRef2 = useRef<HTMLInputElement>(null)
  const clipRefs = [clipRef0, clipRef1, clipRef2] as const

  // 정기 거래처 현장 — 매일 하는 일이 똑같아서 전/후 사진·영상·'오늘 한 작업'을 매일 받으면 아무도 안 쓴다.
  // 거래처가 월간 보고서에서 보는 건 '무슨 문제였고 어떻게 했나'뿐이라 그 한 덩어리만 받는다.
  const isRecurringSite = !!booking.contractId

  const isUploading = before.some((p) => p.uploading) || after.some((p) => p.uploading)
  const savedClipCount = clips.filter((c) => c.url && !c.uploading).length
  const hasPhotos = before.some((p) => !p.uploading && p.url) || after.some((p) => !p.uploading && p.url)

  // 보고서 저장
  const { execute: saveReport, executeAsync: saveReportAsync, isPending: isSaving } = useAction(fieldSaveReportAction, {
    onSuccess: ({ data }) => {
      if (data?.reportId) setSavedReportId(data.reportId)
      toast.success('보고서가 저장됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 현장 메모 3종 저장 — 보고서 저장과 함께 조용히 나간다(토스트는 보고서 쪽 하나만)
  const { execute: saveMemo } = useAction(fieldSaveMemoAction, {
    onError: () => toast.error('메모를 못 저장했어요. 인터넷 확인 후 다시 눌러주세요'),
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
  // 고객 문서에 실릴 본문. 추천 서비스는 여기 넣지 않는다 —
  // 서류에 판촉이 섞이면 격이 떨어지고, 제안은 대기열로 따로 간다.
  const formatAiNotes = (report: AiReportData) =>
    `📋 작업 전 상태\n${report.beforeStatus}\n\n🔧 작업 내용\n${report.workDetails}\n\n✨ 작업 결과\n${report.afterResult}\n\n📌 참고사항\n${report.additionalNotes}`

  // AI 보고서 생성
  const { execute: generateAi, isPending: isGenerating } = useAction(fieldGenerateAiReportAction, {
    onSuccess: ({ data }) => {
      if (data?.report) {
        // '앞으로 손봐야 할 것'은 ai_report_data에 같이 담지 않는다 —
        // 이 글의 주인은 reports.care_advice 컬럼 하나다(고객 문서·홍보 영상 대본이 거기서 읽는다).
        // 두 군데에 두면 한쪽만 고쳐져 서로 다른 문장이 남는다.
        const { careAdvice: polishedAdvice, ...report } = data.report
        const newServices = new Set(report.recommendedServices)
        setAiReport(report)
        if (polishedAdvice) setCareAdvice(polishedAdvice)
        setSelectedServices(newServices)
        // 자동 정리가 집어낸 서비스는 '다음에 제안할 서비스'의 밑그림으로 올려둔다.
        // 현장이 보고 빼거나 더하면 된다 — 고르는 사람은 현장이다.
        if (newServices.size > 0) {
          setSuggestedServices((prev) => [...new Set([...prev, ...newServices])])
        }
        const formatted = formatAiNotes(report)
        setNotes(formatted)
        toast.success('전문 보고서가 작성됐어요!')

        // AI 보고서 생성 즉시 자동 저장 (API 비용 낭비 방지)
        saveReport({
          workerId,
          bookingId: booking.id,
          notes: formatted,
          beforePhotoUrls: before.filter((p) => !p.uploading && p.url).map((p) => p.url),
          afterPhotoUrls: after.filter((p) => !p.uploading && p.url).map((p) => p.url),
          aiReportData: report,
          // 다듬은 문장을 바로 저장한다 — 여기서 안 넣으면 화면엔 다듬은 글이,
          // DB엔 현장이 쓴 메모체가 남아 고객 문서로 옛 문장이 나간다.
          // 이미 다듬은 글이라고 알려줘서 저장 쪽에서 또 다듬지 않게 한다.
          ...(polishedAdvice ? { careAdvice: polishedAdvice, careAdvicePolished: true } : {}),
        })
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? '보고서 작성에 실패했어요. 다시 시도해주세요'),
  })

  // 작업 중 영상 클립 저장 (업로드 완료 시 자동 호출)
  const { execute: saveClips } = useAction(fieldSaveWorkClipsAction, {
    onError: () => toast.error('영상 저장 못 했어요. 인터넷 확인 후 다시 눌러주세요'),
  })

  // 파일을 칸 밖에 떨어뜨리면 브라우저가 그 파일을 열어버려서, 작성 중이던 보고서가 통째로 날아간다.
  // 칸 안에 떨어뜨린 건 아래 dropZone이 먼저 처리하므로 영향 없다.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  // 끌어다 놓기(드래그 앤 드롭) — PC에서 파일 탐색기의 파일을 칸 위에 놓으면 바로 올라간다.
  // 현장 폰에는 드래그가 없으므로 탭해서 고르는 기존 방식은 그대로 둔다.
  // 끄는 동안엔 data-dragging으로 어느 칸에 들어갈지 테두리로 보여준다.
  const dropZone = (kind: 'video' | 'image', onFiles: (files: File[]) => void) => ({
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      e.currentTarget.dataset.dragging = 'true'
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => {
      delete e.currentTarget.dataset.dragging
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      delete e.currentTarget.dataset.dragging
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith(`${kind}/`))
      if (files.length === 0) {
        toast.error(kind === 'video' ? '영상 파일만 올릴 수 있어요' : '사진 파일만 올릴 수 있어요')
        return
      }
      onFiles(files)
    },
  })

  // 영상 클립 업로드 (한 번에 하나씩, 슬롯 인덱스 지정)
  const uploadClip = async (file: File, index: number) => {
    // 고르는 즉시 길이·가로세로·첫 프레임을 읽는다.
    // 올려보고 나서 실패를 알려주면 현장 회선에서 시간만 버린다.
    const meta = await readVideoMeta(file)
    const thumbnailUrl = meta?.thumbnailUrl ?? ''

    const resetSlot = () =>
      setClips((prev) => {
        const next = [...prev]
        next[index] = { url: '', uploading: false, thumbnailUrl: undefined, duration: undefined }
        return next
      })

    // 큰 영상은 우리가 알아서 줄인다 — 사장님·직원에게 "줄여서 올리세요"라고 시키지 않는다.
    // 영상 길이만큼 시간이 걸리므로 슬롯에 진행률을 보여준다(안 보여주면 멈춘 줄 안다).
    setClips((prev) => {
      const next = [...prev]
      next[index] = { url: '', uploading: true, thumbnailUrl, duration: meta?.duration, shrinkPercent: 0 }
      return next
    })

    const upload = await compressVideo(file, meta, (percent) => {
      setClips((prev) => {
        const next = [...prev]
        if (next[index]?.uploading) next[index] = { ...next[index], shrinkPercent: percent }
        return next
      })
    })

    // 줄이고도 못 올릴 크기면 그때 알려준다 (줄이기가 안 되는 폰)
    const verdict = checkVideo(upload, meta)
    if (!verdict.ok) {
      toast.error(verdict.error ?? '이 영상은 올릴 수 없어요')
      resetSlot()
      return
    }
    if (verdict.warning) toast.warning(verdict.warning)

    const ext = upload.name.split('.').pop() ?? 'mp4'
    const path = `${businessId}/${booking.id}/clips/clip${index + 1}-${Date.now()}.${ext}`

    setClips((prev) => {
      const next = [...prev]
      next[index] = { url: '', uploading: true, thumbnailUrl, duration: meta?.duration, shrinkPercent: undefined }
      return next
    })

    try {
      const supabase = createClient()
      const { error } = await supabase.storage.from('report-photos').upload(path, upload, { upsert: true })

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
        next[index] = { url: publicUrl, uploading: false, thumbnailUrl, duration: meta?.duration }

        // 업로드 완료 즉시 DB 자동 저장 (보고서 미저장 상태에서도 동작)
        const done = next.filter((c) => c.url && !c.uploading)
        if (done.length >= 1) {
          saveClips({
            workerId,
            bookingId: booking.id,
            clipUrls: done.map((c) => c.url) as [string, ...string[]],
            // 홍보 영상에서 이 길이에 맞춰 화면을 나눈다 — 못 읽었으면 서버가 알아서 잡는다
            clipDurations: done.map((c) => Math.round((c.duration ?? 0) * 10) / 10),
          })
        }

        return next
      })
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
  }

  // 사진 업로드
  const uploadPhotos = async (
    files: FileList | File[],
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

    // 올리기 전에 줄이고(3MB→250KB 안팎), 3장씩 동시에 올린다.
    // 현장은 대개 LTE라 원본을 한 장씩 보내면 체감이 크게 느리다.
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

  const setCaption = (
    url: string,
    caption: string,
    setSlots: React.Dispatch<React.SetStateAction<PhotoSlot[]>>,
  ) => setSlots((prev) => prev.map((p) => (p.url === url ? { ...p, caption } : p)))

  // 초도 방문인데 위치를 안 적은 사진 — 저장 전에 직원에게 알려준다
  const missingCaptions = booking.isFirstVisit
    ? [...before, ...after].filter((p) => !p.uploading && p.url && !(p.caption ?? '').trim()).length
    : 0

  const handleSave = () => {
    if (!hasPhotos) {
      const confirmed = window.confirm('사진을 업로드하지 않고 저장하시겠습니까?')
      if (!confirmed) return
    }
    // 위치가 비면 거래처 보고서를 만들 수 없다. 막지는 않되(작업 기록은 남아야 한다)
    // 왜 필요한지 분명히 알리고 한 번 더 확인받는다.
    if (missingCaptions > 0) {
      const confirmed = window.confirm(
        `위치를 안 적은 사진이 ${missingCaptions}장 있어요.\n\n` +
        '위치가 없으면 거래처에 보낼 첫 작업 보고서를 만들 수 없어요.\n' +
        '지금 적어주시면 사장님이 바로 보낼 수 있습니다.\n\n' +
        '그래도 이대로 저장할까요?'
      )
      if (!confirmed) return
    }
    saveMemo(memoPayload())
    saveReport(reportPayload())
  }

  // 저장 내용 조립 — 저장 버튼과 발송 버튼이 같은 것을 보내야 한다.
  // (발송 전에 한 번 더 저장한다. 안 그러면 방금 적은 관리 안내·제안 서비스가 통째로 날아간다)
  const memoPayload = () => ({
    workerId,
    bookingId: booking.id,
    // 하자·특이사항은 예약(bookings.memo)에도 같이 남긴다 — 사장님 화면과 월간 보고서가
    // 이 값을 읽는다. 화면에 칸은 하나지만 저장은 두 곳으로 나간다.
    siteMemo: preventiveNote.trim(),
    customerRequest: customerRequest.trim(),
    nextVisitNote: nextVisitNote.trim() || undefined,
  })

  const reportPayload = () => {
    const withCaption = (p: PhotoSlot) => !p.uploading && p.url
    return {
      workerId,
      bookingId: booking.id,
      notes: notes.trim() || undefined,
      preventiveNote: preventiveNote.trim(), // 빈 문자열도 보냄 — 지웠을 때 반영되게
      beforePhotoUrls: before.filter(withCaption).map((p) => p.url),
      afterPhotoUrls: after.filter(withCaption).map((p) => p.url),
      beforePhotoCaptions: before.filter(withCaption).map((p) => (p.caption ?? '').trim()),
      afterPhotoCaptions: after.filter(withCaption).map((p) => (p.caption ?? '').trim()),
      careAdvice,
      careMonths,
      suggestedServices,
      aiReportData: aiReport ? {
        ...aiReport,
        // 선택된 서비스만 저장
        recommendedServices: aiReport.recommendedServices.filter((s) => selectedServices.has(s)),
      } : undefined,
    }
  }

  // ① 전문 보고서로 정리하기 — 메모가 짧으면 먼저 메모 칸으로 데려간다
  const handleAutoWrite = () => {
    const memo = notes.replace(/📋 작업 전 상태\n[\s\S]*$/, '').trim()
    if (memo.length < 5) {
      memoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      memoRef.current?.focus()
      toast.error('오늘 한 작업을 한 줄이라도 적어주세요. 그래야 보고서를 만들 수 있어요')
      return
    }
    generateAi({ workerId, memo, serviceItems, careAdvice: careAdvice.trim() || undefined })
  }

  const handleSend = async () => {
    if (!savedReportId) return
    // 정리 안 된 메모가 그대로 고객에게 나가면 업체 격이 떨어진다 — 정리를 먼저 시킨다
    if (!aiReport) {
      toast.error('먼저 [전문 보고서로 정리하기]를 눌러주세요')
      return
    }
    const confirmed = window.confirm(
      '고객에게 이대로 보내집니다.\n\n' +
      '· 사진과 작업 내용을 한 번 훑어보셨나요?\n' +
      '· 고칠 곳은 각 항목을 눌러 바로 수정할 수 있어요.\n\n' +
      '지금 보낼까요?'
    )
    if (!confirmed) return

    // 보내기 전에 화면에 있는 내용을 먼저 저장한다 — 방금 고친 문장이 안 실린 채 나가면 안 된다
    saveMemo(memoPayload())
    await saveReportAsync(reportPayload())

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
    <div
      className="space-y-2 rounded-xl data-[dragging=true]:ring-2 data-[dragging=true]:ring-primary/60 data-[dragging=true]:ring-offset-4"
      {...dropZone('image', (files) => uploadPhotos(files, slots, setSlots, type))}
    >
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {/* 초도(첫) 방문에서는 사진마다 '어디'를 받는다.
          사장님은 현장에 안 가므로 위치를 알 수 없고, 위치가 없으면 거래처 보고서를 못 만든다.
          평소 방문에서는 예전처럼 썸네일만 나란히 — 직원 부담을 늘리지 않는다. */}
      {booking.isFirstVisit ? (
        <div className="space-y-2">
          {slots.map((p, i) =>
            p.uploading ? (
              <div key={`uploading-${type}-${i}`} className="h-16 rounded-xl bg-muted flex items-center justify-center animate-pulse">
                <Upload className="h-4 w-4 text-muted-foreground" />
              </div>
            ) : (
              <div key={p.url} className="flex items-center gap-2.5">
                <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden border">
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
                <div className="flex-1 min-w-0">
                  <input
                    value={p.caption ?? ''}
                    onChange={(e) => setCaption(p.url, e.target.value, setSlots)}
                    placeholder="어디예요? (예: 처치실 바닥)"
                    className={`w-full h-11 rounded-lg border px-3 text-sm outline-none focus:border-primary ${
                      (p.caption ?? '').trim() ? 'border-input' : 'border-red-300 bg-red-50/50'
                    }`}
                  />
                  {!(p.caption ?? '').trim() && (
                    <p className="text-[11px] text-red-600 mt-1">위치를 적어야 보고서에 들어가요</p>
                  )}
                </div>
              </div>
            )
          )}
          {slots.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full h-12 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <Camera className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">사진 추가</span>
            </button>
          )}
        </div>
      ) : (
      <div className="flex flex-wrap gap-2">
        {slots.map((p, i) =>
          p.uploading ? (
            <div key={`uploading-${type}-${i}`} className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center animate-pulse">
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
      )}
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

  // AI 보고서 섹션 수정
  const updateAiField = (field: keyof Omit<AiReportData, 'recommendedServices'>, value: string) => {
    if (!aiReport) return
    const updated = { ...aiReport, [field]: value }
    setAiReport(updated)
    setNotes(formatAiNotes(updated))
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
      {/* 추천 서비스는 여기서 뺐다 — 고객 문서엔 원래 안 실렸고, 골라도 아무 데도 안 갔다.
          지금은 아래 '다음에 제안할 서비스'에서 골라 대표 승인 후 연락으로 이어진다. */}
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
          <h1 className="font-bold">작업 보고서</h1>
          <p className="text-xs text-muted-foreground">{booking.customerName} · {date}</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* 무엇을 하는 화면인지 한 줄로 — 현장 직원은 설명을 읽지 않으니 짧게, 대신 '누가 보는지'까지 */}
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
          <p className="text-sm font-semibold text-foreground">
            작업 사진과 하자·특이사항을 기록해주세요
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {booking.contractId
              ? '여기 쓴 내용과 사진은 월말에 거래처로 가는 보고서에 그대로 들어가요.'
              : '여기 쓴 내용과 사진은 작업이 끝나면 고객에게 그대로 발송돼요.'}
          </p>
        </div>
        {/* 첫 방문 안내 — 여기 쓴 게 사장님 쪽 초도 리포트 초안이 된다.
            ⚠️ 직원이 입력할 항목은 늘리지 않는다. 늘리면 안 쓰게 되고, 그러면 초안도 안 생긴다.
            평소대로 사진 찍고 메모만 쓰면 되고, 이 안내는 '왜 신경 써야 하는지'만 알려준다. */}
        {booking.isFirstVisit && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
            <p className="text-sm font-semibold text-blue-900">이 현장 첫 방문이에요 · 위치 기재 필수</p>
            <p className="text-xs text-blue-800/90 mt-1.5 leading-relaxed">
              오늘 찍은 사진과 메모는 그대로 <b>거래처에 보내는 첫 작업 보고서</b>가 됩니다.
              사진마다 <b>어디인지</b>를 꼭 적어주세요. 현장을 본 사람은 기사님뿐이라,
              이걸 안 적으면 보고서를 만들 수 없어요.
            </p>
            <p className="text-xs text-blue-800/90 mt-2 leading-relaxed">
              첫 보고서는 거래처가 우리를 계속 쓸지 판단하는 자료예요.
              오늘 한 번만 신경 써주시면 다음 방문부터는 안 물어봅니다.
            </p>
          </div>
        )}
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
        {/* 사진이 어디로 가는지 — 기사님이 알아야 제대로 찍는다.
            "잘 찍어주세요"만으로는 안 움직인다. 이 사진이 고객에게 그대로 간다는 걸 알려준다. */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-800">사진은 고객이 그대로 봅니다</p>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            {booking.contractId
              ? '오늘 찍은 사진은 월말에 거래처로 가는 보고서에 그대로 실려요. 거래처가 재계약을 정할 때 보는 자료예요.'
              : '오늘 찍은 사진은 작업 보고서로 고객 휴대폰에 그대로 갑니다. 고객이 후기를 남길 때도 이 사진을 내려받아 올려요.'}
          </p>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            <b className="text-slate-800">작업 전과 같은 자리·같은 각도</b>로 찍어주세요. 나란히 놓고 보여주기 때문에
            각도가 어긋나면 얼마나 깨끗해졌는지 안 드러나요.
          </p>
        </div>

        {/* 정기 거래처 — 특이사항 하나만 받는다. 저장은 claims라 월간 보고서·홈 타일·대표 알림이 그대로 붙는다 */}
        {isRecurringSite && (
          <SiteIssueSection workerId={workerId} businessId={businessId} bookingId={booking.id} />
        )}

        {!isRecurringSite && (
        <>
        {/* ① 작업 전 사진 */}
        <div className="rounded-xl bg-white border p-4">
          <StepBadge n={1} />
          <PhotoSection
            label="작업 전 사진"
            hint="작업 시작 전 현장 상태를 촬영해주세요"
            slots={before}
            setSlots={setBefore}
            inputRef={beforeInputRef}
            type="before"
          />
        </div>

        {/* ② 하자·특이사항 — 작업 전 사진 바로 다음. 현장에선 사진 찍고 곧바로 이걸 보고한다.
            여기 쓴 내용은 보고서(reports.preventive_note)와 예약 메모(bookings.memo) 양쪽에 저장된다. */}
        <div className="rounded-xl bg-white border p-4 space-y-2">
          <StepBadge n={2} />
          <div>
            <Label className="text-sm font-medium">하자·특이사항</Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              깨진 곳, 원래 있던 흠집, 눈에 띄는 이상을 한 줄만 적어주세요.
              작업 전에 있던 문제를 적어두면 나중에 책임 시비가 안 생겨요.
            </p>
          </div>
          {/* ⚠️'미리 ~해뒀어요'는 여기 적지 않는다 — 이 칸은 월간 보고서에 '현장에서 확인한 특이사항'으로
              실린다. 해준 일은 '오늘 한 작업'에, 앞으로 볼 것은 '앞으로 손봐야 할 것'에 나눠 적어야
              세 칸이 겹치지 않는다. */}
          <Textarea
            placeholder="예: 거실 창틀에 원래 흠집 있었어요. 3층 탕비실 배수구 물 빠짐이 느립니다."
            value={preventiveNote}
            onChange={(e) => setPreventiveNote(e.target.value)}
            rows={3}
          />
        </div>

        {/* ③ 작업 중 영상 — 나가면 다시 못 찍는다. 촬영 요령을 여기 한 곳에만 둔다 */}
        <div className="rounded-xl bg-white border p-4 space-y-3">
          <div>
            <StepBadge n={3} />
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-rose-500" />
              <Label className="text-sm font-medium">작업 중 촬영한 영상</Label>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              1개만 올려도 만들어져요. 3개를 채우면 제일 보기 좋아요
            </p>
          </div>

          {/* 촬영 요령 — 찍는 사람이 올리는 자리에서 봐야 해서 여기 둔다.
              '왜'까지 적는다: 이유를 모르면 다음 현장에서 또 가로로 찍어 온다. */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
            <p className="text-xs font-bold text-amber-900">이렇게 찍어주세요</p>

            <div className="space-y-1 text-[11px] text-amber-900">
              <p><b className="text-amber-950">무엇을</b> ① 더러운 곳 가까이 ② 작업하는 모습 ③ 깨끗해진 결과</p>
              <p><b className="text-amber-950">몇 초</b> 한 개에 5~10초면 딱 좋아요</p>
              <p><b className="text-amber-950">어떻게</b> 폰을 세워서. 눕혀서 찍으면 좌우가 잘려요</p>
            </div>

            <p className="text-[11px] text-amber-800 leading-relaxed border-t border-amber-200 pt-2">
              폰 설정은 건드리지 않으셔도 돼요. 찍은 대로 골라주시면 저희가 알아서 줄여서 올려요.
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
                  <div
                    className="relative w-full aspect-square rounded-xl data-[dragging=true]:ring-2 data-[dragging=true]:ring-rose-400 data-[dragging=true]:ring-offset-2"
                    {...dropZone('video', (files) => uploadClip(files[0]!, idx))}
                  >
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
                              {/* 줄이는 중에는 몇 %인지 보여준다 — 영상 길이만큼 걸려서 안 보여주면 멈춘 줄 안다 */}
                              <span className="text-[10px] text-white font-medium">
                                {slot?.shrinkPercent !== undefined ? `줄이는 중 ${slot.shrinkPercent}%` : '올리는 중'}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                            <span className="text-[10px] text-muted-foreground">
                              {slot?.shrinkPercent !== undefined ? `줄이는 중 ${slot.shrinkPercent}%` : '올리는 중'}
                            </span>
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
                          {/* 드래그는 PC에만 있는 동작이라 좁은 화면에선 숨긴다 */}
                          <span className="hidden md:block text-[10px] text-muted-foreground/70">
                            끌어다 놓아도 돼요
                          </span>
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

          {/* ⛔현장에 '홍보 영상 만들기' 버튼을 두지 않는다.
              홍보는 대표의 일이지 현장 직원의 일이 아니다. 버튼을 누르고 1분을 기다리는 것도
              현장에선 그냥 일이 하나 더 느는 것이고, 직원 입장에선 누를 이유도 없다.
              올려두기만 하면 보고서를 보낼 때(정기 현장은 작업을 끝낼 때) 자동으로 넘어간다. */}
          <p className="text-xs text-muted-foreground text-center">
            {savedClipCount === 0
              ? '올려두시면 사장님이 홍보 영상으로 만들어요'
              : savedClipCount < 3
                ? `${savedClipCount}개 올렸어요. 3개를 채우면 더 보기 좋아요`
                : '다 올리셨어요! 사장님께 자동으로 넘어가요'}
          </p>
        </div>

        {/* ④ 작업 후 사진 */}
        <div className="rounded-xl bg-white border p-4">
          <StepBadge n={4} />
          <PhotoSection
            label="작업 후 사진"
            hint="작업 전과 같은 자리에서 찍어주세요"
            slots={after}
            setSlots={setAfter}
            inputRef={afterInputRef}
            type="after"
          />
        </div>

        {/* 메모 + AI 작성 */}
        <div className="rounded-xl bg-white border p-4 space-y-3">
          <div>
            <StepBadge n={5} />
            <Label className="text-sm font-medium">오늘 한 작업</Label>
            <p className="text-xs text-muted-foreground">간단히 적으면 전문 보고서로 만들어드려요</p>
          </div>

          {/* AI 보고서가 없을 때: 메모 입력 + 생성 버튼 */}
          {!aiReport ? (
            <>
              <Textarea
                ref={memoRef}
                placeholder="예: 주방 후드 기름때 제거, 화장실 곰팡이 제거, 창틀·블라인드 먼지 제거"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />

              {/* '앞으로 손봐야 할 것'도 여기서 같이 받는다.
                  카드 밖에 따로 두면 자동으로 정리되는 항목이 아니라 직원이 알아서 쓰는
                  메모처럼 보이고, 실제로도 다듬지 않은 채 고객 문서로 나갔다. */}
              <div className="pt-1 border-t">
                <CareAdviceInput value={careAdvice} onChange={setCareAdvice} />
              </div>

              {/* 정리 버튼은 아래 고정 바에 ①번으로 있다 — 같은 일을 하는 버튼을 두 곳에 두지 않는다 */}
              <p className="text-xs text-muted-foreground text-center">
                {notes.trim().length > 0 && notes.trim().length < 5
                  ? '한 줄만 더 적어주세요'
                  : '적고 나서 아래 [① 전문 보고서로 정리하기]를 눌러주세요'}
              </p>
            </>
          ) : (
            /* AI 보고서가 있을 때: 결과 표시 + 재작성 버튼 */
            <div className="space-y-3">
              <AiReportView report={aiReport} />

              {/* 다섯 번째 항목 — 위 네 개와 같은 자리, 같은 방식으로 고친다.
                  값의 주인은 careAdvice 상태다(ai_report_data가 아니라 reports.care_advice로 저장된다). */}
              <CareAdviceBox value={careAdvice} onChange={setCareAdvice} />
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground gap-1.5"
                disabled={isGenerating}
                onClick={() => {
                  const confirmed = window.confirm('보고서를 다시 작성할까요?\n\n현재 보고서 내용이 새로 작성됩니다.')
                  if (!confirmed) return
                  // 원본 메모 추출 (AI 포맷팅 전 텍스트)
                  const rawMemo = notes.replace(/📋 작업 전 상태\n[\s\S]*$/, '').trim()
                  if (rawMemo.length >= 5) {
                    generateAi({ workerId, memo: rawMemo, serviceItems, careAdvice: careAdvice.trim() || undefined })
                  } else {
                    // 메모가 너무 짧으면 AI 보고서 초기화해서 메모 입력 모드로 전환
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

        </>
        )}

        {/* 앞으로 손봐야 할 것 — 그 시점이 되면 사장님께 알림이 간다.
            판촉 배너 대신 이걸 남긴다: 근거가 그 현장 기록이라 설득력이 다르다.
            정기·일회성 둘 다 쓴다 — 정기 거래처에도 "다음 달엔 이걸 봐야 한다"가 필요하다.

            ⚠️ 입력칸은 일회성 현장에서만 여기서 감춘다(hideAdvice).
            일회성은 위 '오늘 한 작업' 카드 안에서 받아 같이 다듬기 때문이고,
            정기 현장은 그 카드 자체가 없어서 여기서 받아야 한다. */}
        <div className="rounded-xl bg-white border p-4">
          <CareAdviceField
            advice={careAdvice}
            months={careMonths}
            onAdviceChange={setCareAdvice}
            onMonthsChange={setCareMonths}
            serviceItems={serviceItems}
            suggestions={suggestedServices}
            onSuggestionsChange={setSuggestedServices}
            hideAdvice={!isRecurringSite}
          />
        </div>

        {/* 그 밖에 남길 것 — 늘 쓰는 칸이 아니라 접어둔다.
            예전 '현장 메모 작성'에 있던 두 칸을 그대로 가져왔다(같은 액션에 저장). */}
        <div className="rounded-xl bg-white border overflow-hidden">
          <button
            type="button"
            onClick={() => setExtrasOpen((v) => !v)}
            className="w-full px-4 py-3.5 flex items-center gap-2.5 text-left"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">그 밖에 남길 것 (선택)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                고객이 더 부탁한 것 · 다음에 올 직원이 알아야 할 것
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${extrasOpen ? 'rotate-180' : ''}`} />
          </button>

          {extrasOpen && (
            <div className="px-4 pb-4 space-y-4 border-t pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">고객이 현장에서 더 부탁한 것</Label>
                <Textarea
                  placeholder="예: 베란다 창틀도 닦아달라고 하셨어요"
                  value={customerRequest}
                  onChange={(e) => setCustomerRequest(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">다음에 올 직원이 알아야 할 것</Label>
                <p className="text-xs text-muted-foreground">고객 정보에 저장돼요 (고객에게는 안 보여요)</p>
                <Textarea
                  placeholder="예: 현관 비밀번호 1234#, 강아지 있어요"
                  value={nextVisitNote}
                  onChange={(e) => setNextVisitNote(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 pb-safe space-y-2">
        {/* 순서가 곧 안내다 — ① 정리하기를 먼저 시키고, 정리된 뒤에만 ② 발송하기가 나온다.
            손으로 쓴 메모가 그대로 고객에게 나가면 업체 격이 떨어지기 때문. */}
        {!aiReport && !alreadySent ? (
          <>
            <Button
              size="lg"
              className="w-full h-14 text-base gap-2"
              disabled={isGenerating || isUploading}
              onClick={handleAutoWrite}
            >
              <Sparkles className="h-5 w-5" />
              {isGenerating ? '전문 보고서로 정리 중이에요...' : '① 전문 보고서로 정리하기'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              정리해야 고객에게 보낼 수 있어요. 적은 메모가 그대로 나가지 않아요
            </p>
            <Button
              variant="outline"
              className="w-full h-10 text-sm"
              disabled={isSaving || isUploading}
              onClick={handleSave}
            >
              {isSaving ? '저장 중...' : '나중에 이어서 하기 (저장만)'}
            </Button>
          </>
        ) : !savedReportId ? (
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
            {missingCaptions > 0 && (
              <p className="text-xs text-red-700 text-center bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                위치를 안 적은 사진이 <b>{missingCaptions}장</b> 있어요.
                <br />
                위치가 있어야 거래처 보고서가 만들어져요.
              </p>
            )}
            {/* 정기 거래처엔 방문마다 보내지 않는다 — 쓴 내용은 월간 보고서로 모인다 */}
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
              disabled={!booking.customerPhone || isSending}
              onClick={handleSend}
            >
              <Send className="h-5 w-5" />
              {isSending ? '발송 중...' : '② 고객에게 보고서 발송하기'}
            </Button>
            )}
            {!booking.contractId && !booking.customerPhone && (
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
