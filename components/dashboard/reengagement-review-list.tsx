'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import { Users, Copy, Check, Send, X } from 'lucide-react'
import { sendReengagementAction, skipReengagementAction } from '@/lib/actions/reengagement'

export interface ReengagementItem {
  id: string
  customerName: string
  customerPhone: string
  lastService: string | null
  monthsSince: number | null
  message: string
}

function ReviewRow({ item, onDone }: { item: ReengagementItem; onDone: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState(item.message)

  const { execute: send, isPending: isSending } = useAction(sendReengagementAction, {
    onSuccess: () => {
      toast.success(`${item.customerName}님을 보냄 처리했어요`)
      onDone(item.id)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '처리에 실패했어요'),
  })

  const { execute: skip, isPending: isSkipping } = useAction(skipReengagementAction, {
    onSuccess: () => {
      toast.success(`${item.customerName}님을 건너뛰었어요`)
      onDone(item.id)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '처리에 실패했어요'),
  })

  const handleCopy = async () => {
    await navigator.clipboard.writeText(msg)
    setCopied(true)
    toast.success('문구를 복사했어요. 고객에게 카톡으로 보내주세요')
    setTimeout(() => setCopied(false), 2000)
  }

  const busy = isSending || isSkipping

  return (
    <div className="bg-white rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{item.customerName}님</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.lastService ? `지난 ${item.lastService}` : '지난 이용'}
            {item.monthsSince ? ` · ${item.monthsSince}개월 전` : ''} · {item.customerPhone}
          </p>
        </div>
      </div>

      {/* 개인화 문구 — 수정 가능 */}
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={3}
        className="w-full rounded-lg border p-3 text-sm leading-relaxed outline-none focus:border-emerald-400 resize-none bg-slate-50"
      />

      <button
        type="button"
        onClick={handleCopy}
        className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? '복사됨' : '문구 복사'}
      </button>

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
            if (confirm(`${item.customerName}님 재방문 유도를 건너뛸까요?\n\n목록에서 사라져요.`)) {
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

export function ReengagementReviewList({ items: initialItems }: { items: ReengagementItem[] }) {
  const [items, setItems] = useState(initialItems)
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  if (items.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <Users className="h-10 w-10 text-muted-foreground/40 mx-auto" />
        <p className="text-muted-foreground">지금 재방문 유도할 고객이 없어요</p>
        <p className="text-xs text-muted-foreground">
          마지막 방문 후 90일이 지난 단골 고객이 생기면, 개인화 메시지가 여기에 준비돼요
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ReviewRow key={item.id} item={item} onDone={remove} />
      ))}
    </div>
  )
}
