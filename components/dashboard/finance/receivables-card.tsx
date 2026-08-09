'use client'

import { useRef, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { AlertCircle, Phone, Check } from 'lucide-react'
import { settleBookingPaymentAction } from '@/lib/actions/bookings'

export interface Receivable {
  id: string
  customerName: string
  customerPhone: string | null
  outstanding: number
  scheduledAt: string
}

export function ReceivablesCard({ items }: { items: Receivable[] }) {
  // 낙관적 제거 — '받음' 누르면 즉시 목록에서 사라지고, 실패하면 되살린다
  const [settledIds, setSettledIds] = useState<Set<string>>(new Set())
  const lastIdRef = useRef<string | null>(null)

  const { execute, status } = useAction(settleBookingPaymentAction, {
    onSuccess: () => toast.success('받음 처리했어요!'),
    onError: ({ error }) => {
      // 실패 시 방금 지운 항목 되살리기
      const id = lastIdRef.current
      if (id) {
        setSettledIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
      toast.error(error.serverError ?? '다시 시도해주세요')
    },
  })

  const visible = items.filter((it) => !settledIds.has(it.id))
  const total = visible.reduce((s, it) => s + it.outstanding, 0)
  if (visible.length === 0) return null

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })

  const settle = (it: Receivable) => {
    if (!confirm(`${it.customerName}님에게 ${fmt(it.outstanding)}을 받으셨나요?\n확인하면 미수금에서 사라져요.`)) return
    lastIdRef.current = it.id
    setSettledIds((prev) => new Set(prev).add(it.id))
    execute({ id: it.id })
  }

  return (
    <div className="rounded-xl border-2 border-rose-200 bg-rose-50/60 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-rose-200">
        <AlertCircle className="h-4 w-4 text-rose-500" />
        <p className="font-bold text-rose-900">못 받은 돈</p>
        <span className="ml-auto text-sm font-bold text-rose-600">{fmt(total)}</span>
      </div>
      <div className="divide-y divide-rose-100">
        {visible.map((it) => (
          <div key={it.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{it.customerName}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(it.scheduledAt)} · <span className="text-rose-600 font-medium">{fmt(it.outstanding)} 미수</span>
              </p>
            </div>
            {it.customerPhone && (
              <a
                href={`tel:${it.customerPhone}`}
                className="h-9 w-9 rounded-lg border bg-white flex items-center justify-center shrink-0"
                aria-label="전화 걸기"
              >
                <Phone className="h-4 w-4 text-muted-foreground" />
              </a>
            )}
            <button
              type="button"
              onClick={() => settle(it)}
              disabled={status === 'executing'}
              className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center gap-1 shrink-0 disabled:opacity-60"
            >
              <Check className="h-4 w-4" /> 받음
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
