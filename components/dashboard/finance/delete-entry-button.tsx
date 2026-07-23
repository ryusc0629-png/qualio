'use client'

import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { deleteFinanceEntryAction } from '@/lib/actions/finance'

interface DeleteEntryButtonProps {
  id: string
  label: string // 확인창에 보여줄 설명(분류·금액)
}

export function DeleteEntryButton({ id, label }: DeleteEntryButtonProps) {
  const { execute, isPending } = useAction(deleteFinanceEntryAction, {
    onSuccess: () => toast.success('기록을 지웠어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <button
      onClick={() => {
        if (window.confirm(`'${label}' 기록을 지울까요?`)) execute({ id })
      }}
      disabled={isPending}
      className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
      aria-label="기록 삭제"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
