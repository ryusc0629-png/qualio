'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import { resolveClaimAction, reopenClaimAction, deleteClaimAction } from '@/lib/actions/claims'

interface Props {
  claimId: string
  status: string
}

export function ClaimActions({ claimId, status }: Props) {
  const [resolving, setResolving] = useState(false)
  const [note, setNote] = useState('')

  const resolve = useAction(resolveClaimAction, {
    onSuccess: () => { toast.success('해결로 표시했어요'); setResolving(false); setNote('') },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const reopen = useAction(reopenClaimAction, {
    onSuccess: () => toast.success('다시 열었어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const remove = useAction(deleteClaimAction, {
    onSuccess: () => toast.success('삭제했어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 미해결 상태 — 해결 처리(메모 입력) + 삭제
  if (status !== 'resolved') {
    if (resolving) {
      return (
        <div className="space-y-2 pt-1">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="어떻게 해결했는지 적어두세요 (선택)"
            className="w-full min-h-16 rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={resolve.isPending}
              onClick={() => resolve.execute({ claimId, resolution: note || undefined })}
              className="flex-1 h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {resolve.isPending ? '처리 중...' : '해결 완료'}
            </button>
            <button
              type="button"
              onClick={() => { setResolving(false); setNote('') }}
              className="h-10 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setResolving(true)}
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
        >
          <CheckCircle2 className="h-4 w-4" />
          해결로 표시
        </button>
        <button
          type="button"
          onClick={() => { if (confirm('이 클레임을 삭제할까요?')) remove.execute({ claimId }) }}
          className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-border text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="삭제"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // 해결된 상태 — 다시 열기 + 삭제
  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        type="button"
        onClick={() => reopen.execute({ claimId })}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        다시 열기
      </button>
      <button
        type="button"
        onClick={() => { if (confirm('이 클레임을 삭제할까요?')) remove.execute({ claimId }) }}
        className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border text-destructive hover:bg-destructive/10 transition-colors"
        aria-label="삭제"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
