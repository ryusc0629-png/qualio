'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Bug, X, ImagePlus, Loader2, Film } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { submitBugReportAction } from '@/lib/actions/bug-report'
import { createClient } from '@/lib/supabase/client'

// 첨부 최대 개수·용량 (영상 화면녹화도 고려)
const MAX_FILES = 5
const MAX_SIZE_MB = 50

type Attachment = { url: string; isVideo: boolean }

// 앱 어디서든 눌러 오류를 남길 수 있는 상시 버튼 + 신고 폼(이미지·영상 첨부 가능)
export function BugReportButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { execute, isPending } = useAction(submitBugReportAction, {
    onSuccess: () => {
      toast.success('신고 접수됐어요! 빠르게 확인할게요')
      setMessage('')
      setAttachments([])
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '신고를 접수하지 못했어요. 다시 시도해주세요'),
  })

  // 이미지·영상을 브라우저에서 Supabase 스토리지로 직접 업로드 (Vercel 4.5MB 제한 우회)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (attachments.length + files.length > MAX_FILES) {
      toast.error(`첨부는 최대 ${MAX_FILES}개까지 올릴 수 있어요`)
      return
    }

    setUploading(true)
    const supabase = createClient()
    const added: Attachment[] = []

    for (const file of files) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`파일이 너무 커요(최대 ${MAX_SIZE_MB}MB). 영상은 짧게 찍어주세요`)
        continue
      }
      const ext = file.name.split('.').pop() || 'bin'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('bug-report-media').upload(path, file, { upsert: true })
      if (error) {
        toast.error('첨부 업로드에 실패했어요. 다시 시도해주세요')
        continue
      }
      const { data: { publicUrl } } = supabase.storage.from('bug-report-media').getPublicUrl(path)
      added.push({ url: publicUrl, isVideo: file.type.startsWith('video/') })
    }

    setAttachments((prev) => [...prev, ...added])
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (url: string) => setAttachments((prev) => prev.filter((a) => a.url !== url))

  const handleSubmit = () => {
    if (!message.trim()) {
      toast.error('어떤 문제가 있었는지 적어주세요')
      return
    }
    execute({
      message,
      // 어느 화면에서 신고했는지 + 기기 정보 자동 첨부 (재현에 사용)
      // pathname만 담으면 어떤 예약·고객 화면이었는지 알 수 없어 물음표(?) 뒤까지 함께 담는다
      pageUrl:
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`.slice(0, 500)
          : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      viewport:
        typeof window !== 'undefined'
          ? `${window.innerWidth}x${window.innerHeight} (dpr ${window.devicePixelRatio})`
          : undefined,
      mediaUrls: attachments.length > 0 ? attachments.map((a) => a.url) : undefined,
    })
  }

  return (
    <>
      {/* 상시 플로팅 버튼 — 인쇄 시 숨김, 모바일 하단탭(pb-24)에 안 가리게 위로 띄움 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="오류 신고하기"
        className="fixed bottom-24 right-4 z-30 flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-medium text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground md:bottom-6 print:hidden"
      >
        <Bug className="h-4 w-4" />
        오류 신고
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>불편한 점을 알려주세요</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              어떤 화면에서 무엇이 안 됐는지 편하게 적어주세요. 화면을 캡처하거나 녹화해서 첨부하면
              더 빠르게 고쳐드릴 수 있어요.
            </p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="예: 견적 저장 버튼을 눌렀는데 하얀 화면만 떠요"
              rows={5}
              className="resize-none"
            />

            {/* 첨부 미리보기 */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <div key={a.url} className="relative h-20 w-20 overflow-hidden rounded-lg border bg-muted">
                    {a.isVideo ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                        <Film className="h-6 w-6" />
                        <span className="text-[10px]">영상</span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="첨부 이미지" className="h-full w-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.url)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5"
                      aria-label="첨부 삭제"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 첨부 추가 버튼 */}
            {attachments.length < MAX_FILES && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> 올리는 중...
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4" /> 사진·영상 첨부하기 (선택)
                  </>
                )}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleUpload}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                닫기
              </Button>
              <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending || uploading}>
                {isPending ? '보내는 중...' : '신고 보내기'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
