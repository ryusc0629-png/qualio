'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { updateBugReportAction } from '@/lib/actions/admin-bug-report'

interface Props {
  id: string
  status: string
  adminNote: string | null
}

/** 신규 → 확인 중 → 해결됨 으로 옮기는 버튼 묶음 + 처리 메모 */
export function BugReportRowActions({ id, status, adminNote }: Props) {
  const router = useRouter()
  const [note, setNote] = useState(adminNote ?? '')
  const [noteOpen, setNoteOpen] = useState(false)
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)

  const update = useAction(updateBugReportAction, {
    onSuccess: () => {
      toast.success('바꿨어요')
      setPendingTarget(null)
      setNoteOpen(false)
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '바꾸지 못했어요')
      setPendingTarget(null)
    },
  })

  const buttons = [
    { value: 'reviewing', label: '확인 중' },
    { value: 'resolved', label: '해결됨' },
    { value: 'new', label: '신규로 되돌리기' },
  ].filter((b) => b.value !== status)

  // 상태를 바꿀 때 지금 적어둔 메모를 함께 저장한다 — 따로 저장 버튼을 누르지 않아도 남는다
  const move = (next: string) => {
    setPendingTarget(next)
    update.execute({ id, status: next, adminNote: note })
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {buttons.map((b) => (
          <Button
            key={b.value}
            type="button"
            size="sm"
            variant={b.value === 'resolved' ? 'default' : 'outline'}
            disabled={update.isPending}
            onClick={() => move(b.value)}
          >
            {update.isPending && pendingTarget === b.value ? '바꾸는 중...' : b.label}
          </Button>
        ))}
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          className={`text-xs underline-offset-2 hover:underline ${
            note.trim() ? 'text-foreground font-medium' : 'text-muted-foreground'
          }`}
        >
          {note.trim() ? '처리 메모 보기' : '처리 메모 남기기'}
        </button>
      </div>

      {/* 메모는 접어둔다 — 목록에서 신고 내용이 먼저 보여야 한다 */}
      {noteOpen && (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="무엇이 원인이었고 어떻게 고쳤는지 적어두세요 (예: 알림톡 템플릿 변수 이름 불일치 — 배포 3167923으로 수정)"
            className="min-h-[80px] text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => move(status)}
          >
            {update.isPending && pendingTarget === status ? '저장 중...' : '메모만 저장'}
          </Button>
        </div>
      )}

      {/* 접어둔 상태에서도 메모가 있으면 한 줄로 보여준다 */}
      {!noteOpen && note.trim() && (
        <p className="whitespace-pre-wrap break-words rounded bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  )
}
