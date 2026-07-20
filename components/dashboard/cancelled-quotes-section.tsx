'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { restoreCancelledQuoteAction } from '@/lib/actions/quotes'
import { Phone, RotateCcw, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

export type CancelledQuote = {
  id: string
  customer_name: string
  customer_phone: string | null
  cleaning_type: string | null
  space_size: number | null
  good_price: number | null
}

// 취소한 견적 목록 — 평소엔 접혀 있고, 펼치면 각 건을 '되살리기'로 다시 예약 확정 대기로 되돌릴 수 있음
export function CancelledQuotesSection({ quotes }: { quotes: CancelledQuote[] }) {
  const [open, setOpen] = useState(false)

  if (quotes.length === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-0.5"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        취소한 견적 {quotes.length}건 {open ? '접기' : '보기'}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {quotes.map((quote) => (
            <CancelledQuoteRow key={`cancelled-${quote.id}`} quote={quote} />
          ))}
        </div>
      )}
    </div>
  )
}

function CancelledQuoteRow({ quote }: { quote: CancelledQuote }) {
  const { execute, isPending } = useAction(restoreCancelledQuoteAction, {
    onSuccess: () => toast.success('견적을 되살렸어요. 예약 확정 대기로 돌아갔어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '되살리기 못 했어요. 다시 눌러주세요'),
  })

  return (
    <div className="bg-muted/40 rounded-xl border border-border p-4 opacity-90">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground">취소됨</span>
            <p className="font-semibold text-muted-foreground line-through">{quote.customer_name}</p>
          </div>
          <div className="mt-1 space-y-0.5">
            {quote.customer_phone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" />{quote.customer_phone}
              </p>
            )}
            {quote.cleaning_type && (
              <p className="text-xs text-muted-foreground">
                {quote.cleaning_type}{quote.space_size ? ` · ${quote.space_size}평` : ''}
              </p>
            )}
            {quote.good_price && (
              <p className="text-xs text-muted-foreground">견적가 {quote.good_price.toLocaleString('ko-KR')}원~</p>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => execute({ quote_id: quote.id })}
            disabled={isPending}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50 transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            되살리기
          </button>
        </div>
      </div>
    </div>
  )
}
