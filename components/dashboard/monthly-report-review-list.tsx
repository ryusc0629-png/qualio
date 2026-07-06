'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import { FileText, Copy, Check, Send, X } from 'lucide-react'
import { sendMonthlyReportAction, skipMonthlyReportAction } from '@/lib/actions/monthly-reports'

export interface ReviewItem {
  id: string
  customerId: string
  customerName: string
  period: string // 'YYYY-MM'
  completedVisits: number
}

function periodLabel(period: string): string {
  const [, m] = period.split('-')
  return `${Number(m)}월`
}

function ReviewRow({
  item,
  businessId,
  onDone,
}: {
  item: ReviewItem
  businessId: string
  onDone: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/q/${businessId}/monthly-report/${item.customerId}?month=${item.period}`

  const { execute: send, isPending: isSending } = useAction(sendMonthlyReportAction, {
    onSuccess: () => {
      toast.success(`${item.customerName} ${periodLabel(item.period)} 리포트를 보냄 처리했어요`)
      onDone(item.id)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '처리에 실패했어요'),
  })

  const { execute: skip, isPending: isSkipping } = useAction(skipMonthlyReportAction, {
    onSuccess: () => {
      toast.success(`${item.customerName} 리포트를 건너뛰었어요`)
      onDone(item.id)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '처리에 실패했어요'),
  })

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('링크를 복사했어요. 거래처 담당자에게 보내주세요')
    setTimeout(() => setCopied(false), 2000)
  }

  const busy = isSending || isSkipping

  return (
    <div className="bg-white rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{item.customerName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {periodLabel(item.period)} · 완료 방문 {item.completedVisits}회
          </p>
        </div>
      </div>

      {/* 미리보기 / 링크 복사 */}
      <div className="flex gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          <FileText className="h-4 w-4" />
          리포트 미리보기
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-border bg-white text-sm font-medium text-muted-foreground hover:border-emerald-300 hover:text-emerald-700 transition-colors"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? '복사됨' : '링크 복사'}
        </button>
      </div>

      {/* 보냄 처리 / 건너뛰기 */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => send({ dispatchId: item.id })}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {isSending ? '처리 중...' : '보냈어요'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm(`${item.customerName} ${periodLabel(item.period)} 리포트를 건너뛸까요?\n\n목록에서 사라져요.`)) {
              skip({ dispatchId: item.id })
            }
          }}
          className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-border bg-white text-sm font-medium text-muted-foreground hover:border-red-300 hover:text-red-500 transition-colors disabled:opacity-60"
        >
          <X className="h-4 w-4" />
          건너뛰기
        </button>
      </div>
    </div>
  )
}

export function MonthlyReportReviewList({
  items: initialItems,
  businessId,
}: {
  items: ReviewItem[]
  businessId: string
}) {
  const [items, setItems] = useState(initialItems)
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  if (items.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" />
        <p className="text-muted-foreground">지금 보낼 리포트가 없어요</p>
        <p className="text-xs text-muted-foreground">
          매월 초, 지난달 정기계약 거래처의 작업 리포트가 여기에 준비돼요
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ReviewRow key={item.id} item={item} businessId={businessId} onDone={remove} />
      ))}
    </div>
  )
}
