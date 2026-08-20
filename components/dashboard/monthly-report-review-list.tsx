'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import { FileText, Copy, Check, Send, X } from 'lucide-react'
import {
  sendMonthlyReportAction,
  skipMonthlyReportAction,
  markCustomerRequestDoneAction,
} from '@/lib/actions/monthly-reports'

/** 이번 달 현장에서 고객이 추가로 부탁한 것 — 보내기 전에 처리 여부를 표시한다 */
export interface ReviewRequest {
  bookingId: string
  date: string
  note: string
  done: boolean
}

export interface ReviewItem {
  id: string
  customerId: string
  customerName: string
  period: string // 'YYYY-MM'
  completedVisits: number
  requests: ReviewRequest[]
}

function periodLabel(period: string): string {
  const [, m] = period.split('-')
  return `${Number(m)}월`
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
}

/**
 * 현장 요청 처리 표시 — 리포트를 보내기 전에 사장님이 한 번 누른다.
 *
 * 왜 이 자리인가: 이걸 안 누르면 거래처가 받는 리포트 상단이 "요청 5건 · 처리 1건"처럼
 * 우리가 일을 안 한 것처럼 보인다. 현장 요청은 처리 여부를 적을 칸이 아예 없었기 때문이다.
 * 체크를 현장 직원에게 시키지 않는 이유는 입력을 늘리면 요청 자체를 안 적게 되어서다.
 */
function RequestChecklist({ requests }: { requests: ReviewRequest[] }) {
  const [state, setState] = useState(requests)

  const { execute } = useAction(markCustomerRequestDoneAction, {
    onError: ({ error }) => {
      toast.error(error.serverError ?? '처리에 실패했어요')
      // 서버가 거절했으면 화면도 되돌린다 — 눌린 채로 두면 처리한 줄 알게 된다
      setState(requests)
    },
  })

  if (state.length === 0) return null

  const doneCount = state.filter((r) => r.done).length

  const toggle = (bookingId: string, done: boolean) => {
    setState((prev) => prev.map((r) => (r.bookingId === bookingId ? { ...r, done } : r)))
    execute({ bookingId, done })
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-xs font-semibold text-amber-900">
        현장에서 받은 요청 {state.length}건 · 처리 {doneCount}건
      </p>
      <p className="mt-0.5 text-[11px] text-amber-800/80">
        처리한 건에 체크해 주세요. 체크해야 리포트에 &lsquo;처리 완료&rsquo;로 나가요
      </p>
      <ul className="mt-2 space-y-1.5">
        {state.map((r) => (
          <li key={r.bookingId}>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={r.done}
                onChange={(e) => toggle(r.bookingId, e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="text-xs leading-relaxed text-slate-700">
                <span className="text-slate-400">{dayLabel(r.date)}</span> {r.note}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
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
    onSuccess: ({ data }) => {
      // 카톡이 실제로 나갔을 때만 여기 온다(못 나가면 서버가 막고 오류로 알려준다).
      // 연락처가 없는 거래처만 '보냄 처리'로 남는다 — 그 경우 링크를 직접 전달해야 한다.
      toast.success(
        data?.alimtalkSent
          ? `${item.customerName}에 ${periodLabel(item.period)} 리포트를 보냈어요`
          : `${item.customerName} ${periodLabel(item.period)} 리포트를 보냄 처리했어요 (연락처가 없어 링크를 직접 전달해 주세요)`
      )
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

      {/* 현장 요청 처리 체크 — 미리보기보다 위에 둔다(보고 나서 고치면 다시 봐야 한다) */}
      <RequestChecklist requests={item.requests} />

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
