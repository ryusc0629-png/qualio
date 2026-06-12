'use client'

import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { archiveQuoteAction } from '@/lib/actions/quotes'
import { Archive } from 'lucide-react'

export function ArchiveQuoteButton({ quoteId }: { quoteId: string }) {
  const { execute, isPending } = useAction(archiveQuoteAction, {
    onSuccess: () => toast.success('보관함으로 이동했어요'),
    onError:   ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <button
      type="button"
      onClick={() => execute({ quote_id: quoteId })}
      disabled={isPending}
      title="보관하기"
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors px-2 py-1 rounded-md hover:bg-muted"
    >
      <Archive className="h-3.5 w-3.5" />
      {isPending ? '보관 중...' : '보관'}
    </button>
  )
}
