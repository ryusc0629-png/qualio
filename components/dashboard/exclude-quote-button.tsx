'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { markQuoteTestAction } from '@/lib/actions/quotes'
import { FlaskConical, Loader2 } from 'lucide-react'

// 사장님/고객이 테스트로 남긴 장난 견적을 통계에서 빼는 버튼(가짜 번호로 남긴 것 대비).
// 통계·대기목록에서 사라지는 동작이라 한 번 더 확인(인라인 2단계) 후 실행.
export function ExcludeQuoteButton({ quoteId }: { quoteId: string }) {
  const [confirming, setConfirming] = useState(false)
  const { execute, isPending } = useAction(markQuoteTestAction, {
    onSuccess: () => toast.success('통계에서 뺐어요 (테스트로 표시)'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 눌러주세요'),
  })

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => execute({ quote_id: quoteId, is_test: true })}
          disabled={isPending}
          className="flex items-center gap-1 text-xs font-medium text-white bg-slate-600 hover:bg-slate-700 disabled:opacity-60 transition-colors px-2 py-1 rounded-md"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          네, 통계에서 빼기
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
      title="테스트/장난 견적을 통계에서 제외"
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-slate-700 transition-colors px-2 py-1 rounded-md hover:bg-slate-100 font-medium"
    >
      <FlaskConical className="h-3.5 w-3.5" />
      테스트
    </button>
  )
}
