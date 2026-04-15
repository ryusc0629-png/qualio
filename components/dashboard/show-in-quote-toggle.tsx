'use client'

import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { toggleShowInQuoteAction } from '@/lib/actions/services'

interface Props {
  id: string
  showInQuote: boolean
}

export function ShowInQuoteToggle({ id, showInQuote }: Props) {
  const { execute, isPending } = useAction(toggleShowInQuoteAction, {
    onError: ({ error }) => toast.error(error.serverError ?? '저장에 실패했습니다'),
  })

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => execute({ id, show_in_quote: !showInQuote })}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        showInQuote ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
      title={showInQuote ? '견적폼에 표시 중 (클릭 시 숨김)' : '견적폼에서 숨김 (클릭 시 표시)'}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          showInQuote ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
