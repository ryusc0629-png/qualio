'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Camera, X, Upload, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { saveReportAction, sendReviewRequestAction } from '@/lib/actions/reports'

interface CompleteReportButtonProps {
  bookingId:    string
  customerName: string
  businessId:   string
}

type PhotoSlot = { url: string; uploading: boolean }

export function CompleteReportButton({ bookingId, customerName, businessId }: CompleteReportButtonProps) {
  const [open, setOpen]           = useState(false)
  const [notes, setNotes]         = useState('')
  const [before, setBefore]       = useState<PhotoSlot[]>([])
  const [after, setAfter]         = useState<PhotoSlot[]>([])
  const [savedReportId, setSavedReportId] = useState<string | null>(null)
  const beforeInputRef            = useRef<HTMLInputElement>(null)
  const afterInputRef             = useRef<HTMLInputElement>(null)

  const isUploading = before.some((p) => p.uploading) || after.some((p) => p.uploading)

  const { execute, isPending } = useAction(saveReportAction, {
    onSuccess: ({ data }) => {
      toast.success('보고서가 저장됐어요!')
      if (data?.reportId) setSavedReportId(data.reportId)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: sendReview, isPending: isSendingReview } = useAction(sendReviewRequestAction, {
    onSuccess: () => toast.success('리뷰 요청 알림톡을 보냈어요!'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const uploadPhotos = async (
    files: FileList,
    slot: PhotoSlot[],
    setSlot: React.Dispatch<React.SetStateAction<PhotoSlot[]>>,
    type: 'before' | 'after',
  ) => {
    const remaining = 5 - slot.length
    if (remaining <= 0) {
      toast.error('사진은 최대 5장까지 등록할 수 있어요')
      return
    }
    const toUpload = Array.from(files).slice(0, remaining)

    const placeholders = toUpload.map(() => ({ url: '', uploading: true }))
    setSlot((prev) => [...prev, ...placeholders])

    const supabase = createClient()
    const uploaded: string[] = []

    for (const file of toUpload) {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${businessId}/${bookingId}/${type}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('report-photos').upload(path, file, { upsert: true })
      if (error) {
        toast.error('사진 업로드에 실패했어요')
        continue
      }
      const { data: { publicUrl } } = supabase.storage.from('report-photos').getPublicUrl(path)
      uploaded.push(publicUrl)
    }

    // 업로드 완료 시 placeholder를 실제 URL로 교체
    setSlot((prev) => {
      const result = [...prev.filter((p) => !p.uploading)]
      uploaded.forEach((url) => result.push({ url, uploading: false }))
      return result
    })
  }

  const removePhoto = (
    url: string,
    setSlot: React.Dispatch<React.SetStateAction<PhotoSlot[]>>,
  ) => setSlot((prev) => prev.filter((p) => p.url !== url))

  const handleSave = (withAlimtalk: boolean) => {
    execute({
      bookingId,
      notes: notes.trim() || undefined,
      beforePhotoUrls: before.filter((p) => !p.uploading && p.url).map((p) => p.url),
      afterPhotoUrls:  after.filter((p) => !p.uploading && p.url).map((p) => p.url),
      sendAlimtalk: withAlimtalk,
    })
  }

  const PhotoSection = ({
    label,
    slots,
    setSlots,
    inputRef,
    type,
  }: {
    label: string
    slots: PhotoSlot[]
    setSlots: React.Dispatch<React.SetStateAction<PhotoSlot[]>>
    inputRef: React.RefObject<HTMLInputElement | null>
    type: 'before' | 'after'
  }) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex flex-wrap gap-2">
        {slots.map((p) =>
          p.uploading ? (
            <div key={`uploading-${type}`} className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center animate-pulse">
              <Upload className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <div key={p.url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
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
            className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/30 transition-colors"
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

  return (
    <>
      <Button
        variant="default"
        size="sm"
        className="w-full h-11"
        onClick={() => { setOpen(true); setSavedReportId(null); setBefore([]); setAfter([]); setNotes('') }}
      >
        <ClipboardList className="h-4 w-4 mr-2" />
        완료 보고서 작성
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>작업 완료 보고서</DialogTitle>
            <p className="text-sm text-muted-foreground">{customerName} 고객님</p>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            <PhotoSection
              label="작업 전 사진"
              slots={before}
              setSlots={setBefore}
              inputRef={beforeInputRef}
              type="before"
            />
            <PhotoSection
              label="작업 후 사진"
              slots={after}
              setSlots={setAfter}
              inputRef={afterInputRef}
              type="after"
            />

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">특이사항 · 메모</p>
              <Textarea
                placeholder="작업 중 특이사항이나 고객에게 전달할 내용을 입력해주세요 (선택)"
                className="resize-none text-sm"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              {!savedReportId ? (
                <>
                  <Button
                    className="w-full h-12 font-bold"
                    disabled={isPending || isUploading || (before.length === 0 && after.length === 0)}
                    onClick={() => handleSave(true)}
                  >
                    {isPending ? '저장 중...' : '카카오 알림톡으로 고객에게 보내기'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-10 text-sm"
                    disabled={isPending || isUploading}
                    onClick={() => handleSave(false)}
                  >
                    {isPending ? '저장 중...' : '저장만 하기 (알림 없이)'}
                  </Button>
                  {before.length === 0 && after.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center">사진을 1장 이상 추가해야 알림톡을 보낼 수 있어요</p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-green-50 rounded-xl px-4 py-3">
                    <span className="text-green-600 text-lg">✅</span>
                    <p className="text-sm font-semibold text-green-800">보고서가 저장됐어요!</p>
                  </div>
                  <Button
                    className="w-full h-12 font-bold"
                    disabled={isSendingReview}
                    onClick={() => sendReview({ reportId: savedReportId })}
                  >
                    {isSendingReview ? '발송 중...' : '⭐ 리뷰 요청 알림톡 보내기'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-10 text-sm"
                    onClick={() => {
                      const reportUrl = `${window.location.origin}/q/${businessId}/report/${savedReportId}`
                      navigator.clipboard?.writeText(reportUrl).catch(() => null)
                      toast.success('보고서 링크가 복사됐어요!')
                    }}
                  >
                    보고서 링크 복사
                  </Button>
                  <Button variant="ghost" className="w-full h-9 text-sm text-muted-foreground" onClick={() => setOpen(false)}>
                    닫기
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
