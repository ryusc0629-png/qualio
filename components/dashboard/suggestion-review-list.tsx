'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import { Sparkles, CalendarClock, Check, X, Plus, HardHat, Copy, Phone, MessageSquare } from 'lucide-react'
import { approveSuggestionAction, registerSuggestedServiceAction, skipReengagementAction } from '@/lib/actions/reengagement'
import { formatPhone } from '@/lib/format/phone'

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
  /** 이 손님이 문자 수신에 동의했는지. 아니면 그날 알림만 가고 사장님이 직접 연락한다 */
  smsAllowed: boolean
  /** pending(아직 결정 전) | scheduled(승인해둠) */
  status: string
  /** sms(그날 문자 자동) | manual(그날 알림만) */
  channel: string
  /** 연락하기로 한 날이 지났는지 */
  isDue: boolean
}

function SuggestionRow({
  item,
  onDone,
  variant = 'action',
}: {
  item: SuggestionItem
  onDone: (id: string) => void
  /** 'reserved'는 이미 정해둔 것 — 읽고 취소만 한다 */
  variant?: 'action' | 'reserved'
}) {
  const [msg, setMsg] = useState(item.message)
  // 방금 누른 버튼이 문자였는지 — 성공 안내 문구를 맞게 띄우기 위해서만 쓴다
  const pickedSms = useRef(false)
  const [registered, setRegistered] = useState(!item.unregistered)

  const { execute: approve, isPending: isApproving } = useAction(approveSuggestionAction, {
    onSuccess: () => {
      toast.success(
        pickedSms.current
          ? `${item.dueLabel}에 ${item.customerName}님께 문자가 나가요`
          : `${item.dueLabel}에 알려드릴게요. 그때 전화하시면 됩니다`
      )
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

  // 이미 정해둔 건 — 무엇을 언제 어떻게 하기로 했는지만 한 줄로 보여주고, 취소만 열어둔다.
  // 여기서 또 승인 버튼을 보여주면 "아직 안 된 건가?" 하고 다시 누르게 된다.
  if (variant === 'reserved') {
    return (
      <div className="bg-white rounded-xl border border-border p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">
            {item.customerName}님 · {item.serviceName}
          </p>
          <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3 shrink-0" />
            {item.dueLabel}에 {item.channel === 'sms' ? '문자 자동 발송' : '알림 받고 전화'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm(`${item.customerName}님 ${item.serviceName} 예약을 취소할까요?`)) {
              skip({ dispatchId: item.id })
            }
          }}
          className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-border bg-white text-xs font-medium text-muted-foreground hover:border-red-300 hover:text-red-500 disabled:opacity-60"
        >
          <X className="h-3.5 w-3.5" />
          취소
        </button>
      </div>
    )
  }

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
            <a href={`tel:${item.customerPhone}`} className="underline underline-offset-2">
              {formatPhone(item.customerPhone)}
            </a>
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

      {/* 문자 수신에 동의 안 한 손님 — 6개월 뒤에 알면 늦으니 지금 알려준다.
          견적 폼에 "동의 안 하시면 광고 문자 안 보냅니다"라고 약속했으므로 예외를 두지 않는다. */}
      {!item.smsAllowed && !item.failReason && (
        <p className="text-xs bg-slate-50 border rounded-lg p-3 text-muted-foreground">
          이 손님은 <b>문자 수신에 동의하지 않으셨어요.</b> 문자는 안 나가고,
          <b> {item.dueLabel}에 알림</b>으로 알려드릴게요. 그때 전화 한 통이면 됩니다
        </p>
      )}

      {/* 자동 발송이 막힌 건 — 왜 못 보내는지와 무엇을 하면 되는지를 그 자리에서 알린다 */}
      {item.failReason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm text-amber-900">{item.failReason}</p>
          <div className="flex gap-2">
            {/* 전화가 먼저다 — 재구매 제안은 문자보다 통화가 훨씬 잘 된다 */}
            <a
              href={`tel:${item.customerPhone}`}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700"
            >
              <Phone className="h-3.5 w-3.5" />
              전화하기
            </a>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(msg)
                toast.success('문구를 복사했어요. 카톡으로 보내주세요')
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-amber-300 bg-white text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              <Copy className="h-3.5 w-3.5" />
              문구 복사
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          그날 쓰실 문구예요 (수정 가능) — 전화로 말씀하실 때 그대로 읽으셔도 됩니다
        </p>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={8}
          className="w-full rounded-lg border p-3 text-sm leading-relaxed outline-none focus:border-emerald-400 resize-none bg-slate-50 whitespace-pre-wrap"
        />
        {item.smsAllowed && (
          <p className="text-[11px] text-muted-foreground">
            광고 문자라 (광고) 표기와 수신거부 주소는 지우면 안 돼요. 법으로 정해져 있어요
          </p>
        )}
      </div>

      {/* 문자 발송은 '고르는 것'으로 둔다 — 편한 대신 건당 요금이 붙기 때문.
          기본은 무료인 '알려주세요'이고, 문자는 동의한 손님에게만 선택지로 보인다. */}
      {!item.failReason && item.smsAllowed && (
        <button
          type="button"
          disabled={busy}
          onClick={() => { pickedSms.current = true; approve({ dispatchId: item.id, ...(msg !== item.message ? { message: msg } : {}), channel: 'sms' }) }}
          className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-lg border border-emerald-300 bg-white text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-60"
        >
          <MessageSquare className="h-4 w-4" />
          {isApproving ? '처리 중...' : `${item.dueLabel}에 문자로 자동 발송 (문자 요금 1건)`}
        </button>
      )}

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
            onClick={() => { pickedSms.current = false; approve({ dispatchId: item.id, ...(msg !== item.message ? { message: msg } : {}), channel: 'manual' }) }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {isApproving ? '처리 중...' : `${item.dueLabel}에 알려주세요`}
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

export function SuggestionReviewList({
  items: initialItems,
  variant = 'action',
  emptyText,
}: {
  items: SuggestionItem[]
  variant?: 'action' | 'reserved'
  emptyText?: string
}) {
  const [items, setItems] = useState(initialItems)
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  // 예약 목록은 비면 구역 자체를 안 그리므로(페이지에서 처리) 빈 화면이 필요 없다
  if (items.length === 0) {
    if (variant === 'reserved') return null
    return (
      <div className="text-center py-10 space-y-2 rounded-xl border border-dashed">
        <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">
          {emptyText ?? '현장에서 올린 제안이 아직 없어요'}
        </p>
        <p className="text-xs text-muted-foreground">
          직원이 작업 보고서에서 &lsquo;다음에 제안할 서비스&rsquo;를 고르면 여기로 올라와요
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <SuggestionRow key={item.id} item={item} onDone={remove} variant={variant} />
      ))}
    </div>
  )
}
