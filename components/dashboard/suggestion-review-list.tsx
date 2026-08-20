'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import { Sparkles, CalendarClock, Check, X, Plus, HardHat, Copy } from 'lucide-react'
import { approveSuggestionAction, registerSuggestedServiceAction, skipReengagementAction } from '@/lib/actions/reengagement'

// 현장에서 올린 '다음에 제안할 서비스' 검토 카드.
//
// 여기서 승인해야만 고객에게 문자가 나간다. 승인 전에는 아무것도 안 나간다.
// 현장이 직접 적은 이름(서비스 항목에 없는 것)은 이 자리에서 등록할 수 있게 한다 —
// 현장이 실제로 파는 것을 사장님이 알게 되는 통로다.

export interface SuggestionItem {
  id: string
  customerName: string
  customerPhone: string
  serviceName: string
  reason: string | null
  workerName: string | null
  dueLabel: string
  message: string
  /** 업체 서비스 항목에 없는 이름인지 */
  unregistered: boolean
  /** 자동 문자를 못 보낸 이유 — 있으면 사장님이 직접 연락해야 한다 */
  failReason?: string | null
}

function SuggestionRow({ item, onDone }: { item: SuggestionItem; onDone: (id: string) => void }) {
  const [msg, setMsg] = useState(item.message)
  const [registered, setRegistered] = useState(!item.unregistered)

  const { execute: approve, isPending: isApproving } = useAction(approveSuggestionAction, {
    onSuccess: () => {
      toast.success(`${item.dueLabel}에 ${item.customerName}님께 문자가 나가요`)
      onDone(item.id)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '승인하지 못했어요. 다시 눌러주세요'),
  })

  const { execute: skip, isPending: isSkipping } = useAction(skipReengagementAction, {
    onSuccess: () => {
      toast.success('목록에서 뺐어요')
      onDone(item.id)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '처리하지 못했어요'),
  })

  const { execute: registerService, isPending: isRegistering } = useAction(registerSuggestedServiceAction, {
    onSuccess: () => {
      setRegistered(true)
      toast.success(`'${item.serviceName}'를 서비스 항목에 넣었어요. 가격은 서비스 화면에서 정해주세요`)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '등록하지 못했어요'),
  })

  const busy = isApproving || isSkipping

  return (
    <div className="bg-white rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">
            {item.customerName}님 · {item.serviceName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1">
              <HardHat className="h-3 w-3 shrink-0" />
              {item.workerName ?? '현장'} 추천
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3 shrink-0" />
              {item.dueLabel}에 발송
            </span>
            <span>{item.customerPhone}</span>
          </p>
        </div>
      </div>

      {item.reason && (
        <p className="text-sm bg-amber-50 border border-amber-100 rounded-lg p-3 text-amber-900">
          {item.reason}
        </p>
      )}

      {!registered && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground min-w-0">
            <b>{item.serviceName}</b>는 서비스 항목에 없어요. 현장에서 직접 적은 이름이에요
          </p>
          <button
            type="button"
            disabled={isRegistering}
            onClick={() => registerService({ name: item.serviceName })}
            className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {isRegistering ? '등록 중...' : '서비스로 등록'}
          </button>
        </div>
      )}

      {/* 자동 발송이 막힌 건 — 왜 못 보내는지와 무엇을 하면 되는지를 그 자리에서 알린다 */}
      {item.failReason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm text-amber-900">{item.failReason}</p>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(msg)
              toast.success('문구를 복사했어요. 카톡이나 문자로 보내주세요')
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-amber-300 bg-white text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <Copy className="h-3.5 w-3.5" />
            문구 복사
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          {item.failReason ? '준비된 문구예요 (수정 가능)' : `${item.dueLabel}에 이 문자가 나갑니다 (수정 가능)`}
        </p>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={8}
          className="w-full rounded-lg border p-3 text-sm leading-relaxed outline-none focus:border-emerald-400 resize-none bg-slate-50 whitespace-pre-wrap"
        />
        <p className="text-[11px] text-muted-foreground">
          광고 문자라 (광고) 표기와 수신거부 주소는 지우면 안 돼요. 법으로 정해져 있어요
        </p>
      </div>

      <div className="flex gap-2">
        {item.failReason ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => skip({ dispatchId: item.id })}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {isSkipping ? '처리 중...' : '연락했어요'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => approve({ dispatchId: item.id, message: msg })}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {isApproving ? '처리 중...' : `${item.dueLabel}에 보내기`}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm(`${item.customerName}님 ${item.serviceName} 제안을 뺄까요?\n\n목록에서 사라져요.`)) {
              skip({ dispatchId: item.id })
            }
          }}
          className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-border bg-white text-sm font-medium text-muted-foreground hover:border-red-300 hover:text-red-500 transition-colors disabled:opacity-60"
        >
          <X className="h-4 w-4" />
          안 보냄
        </button>
      </div>
    </div>
  )
}

export function SuggestionReviewList({ items: initialItems }: { items: SuggestionItem[] }) {
  const [items, setItems] = useState(initialItems)
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  if (items.length === 0) {
    return (
      <div className="text-center py-10 space-y-2 rounded-xl border border-dashed">
        <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">현장에서 올린 제안이 아직 없어요</p>
        <p className="text-xs text-muted-foreground">
          직원이 작업 보고서에서 &lsquo;다음에 제안할 서비스&rsquo;를 고르면 여기로 올라와요
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <SuggestionRow key={item.id} item={item} onDone={remove} />
      ))}
    </div>
  )
}
