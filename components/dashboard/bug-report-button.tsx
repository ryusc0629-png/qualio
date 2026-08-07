'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { submitBugReportAction } from '@/lib/actions/bug-report'

// 앱 어디서든 눌러 오류를 남길 수 있는 상시 버튼 + 신고 폼
// 화면 하단 오른쪽에 작게 떠 있어(모바일 하단탭 위) 언제든 접근 가능
export function BugReportButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')

  const { execute, isPending } = useAction(submitBugReportAction, {
    onSuccess: () => {
      toast.success('신고 접수됐어요! 빠르게 확인할게요')
      setMessage('')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '신고를 접수하지 못했어요. 다시 시도해주세요'),
  })

  const handleSubmit = () => {
    if (!message.trim()) {
      toast.error('어떤 문제가 있었는지 적어주세요')
      return
    }
    execute({
      message,
      // 어느 화면에서 신고했는지 + 기기 정보 자동 첨부 (재현에 사용)
      pageUrl: typeof window !== 'undefined' ? window.location.pathname : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>불편한 점을 알려주세요</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              어떤 화면에서 무엇이 안 됐는지 편하게 적어주세요. 바로 확인해서 고쳐드릴게요.
            </p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="예: 견적 저장 버튼을 눌렀는데 하얀 화면만 떠요"
              rows={5}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                닫기
              </Button>
              <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending}>
                {isPending ? '보내는 중...' : '신고 보내기'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
