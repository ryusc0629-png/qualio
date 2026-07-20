'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { cancelQuoteAction } from '@/lib/actions/quotes'
import { X, Loader2 } from 'lucide-react'

// 전화해보니 고객이 "안 한다"고 할 때 견적 요청(예약 확정 대기)을 취소하는 버튼.
// 파괴적 동작이라 한 번 더 확인(인라인 2단계) 후 실행.
export function CancelQuoteButton({ quoteId }: { quoteId: string }) {
  const [confirming, setConfirming] = useState(false)
  const { execute, isPending } = useAction(cancelQuoteAction, {
    onSuccess: () => toast.success('견적 요청을 취소했어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '취소 못 했어요. 다시 눌러주세요'),
  })

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => execute({ quote_id: quoteId })}
          disabled={isPending}
          className="flex items-center gap-1 text-xs font-medium text-white bg-destructive hover:bg-destructive/90 disabled:opacity-60 transition-colors px-2 py-1 rounded-md"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          네, 취소할게요
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md"
        >
          아니요
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10 font-medium"
    >
      <X className="h-3.5 w-3.5" />
      취소
    </button>
  )
}
