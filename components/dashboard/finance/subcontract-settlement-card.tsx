'use client'

// 도급 정산 카드 — 계약서의 정산 조건 + 그 달 현장 금액으로 '내 몫'과 '도급비'를 보여주고
// 사장님이 '장부에 넣기'를 누르면 매출·지출로 확정 기입한다.
//
// 화면 숫자는 항상 실시간 계산이고, 장부에 들어간 달은 '장부에 들어감' 배지가 붙는다.

import { useState } from 'react'
import Link from 'next/link'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Handshake, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatWon } from '@/lib/finance/constants'
import {
  postSubcontractSettlementAction,
  unpostSubcontractSettlementAction,
} from '@/lib/actions/subcontract-settlement'

export interface SettlementCardData {
  workerId: string
  workerName: string
  color: string
  hasContract: boolean
  recurring: { contractId: string; clientName: string; amount: number; visits: number; monthlyPrice: number }[]
  oneOff: { bookingId: string; clientName: string; amount: number; date: string }[]
  result: {
    sharePercent: number | null
    recurringRevenue: number
    oneOffRevenue: number
    revenue: number
    ownerShare: number
    contractorPay: number
    jobCount: number
    blocked: string | null
  }
  posted: boolean
}

interface Props {
  month: string
  items: SettlementCardData[]
  /** 이 달 장부에 사장님이 직접 넣은 매출 합 — 중복 기입 경고용 */
  manualRevenue?: number
}

export function SubcontractSettlementCard({ month, items, manualRevenue = 0 }: Props) {
  const monthLabel = `${Number(month.slice(5, 7))}월`
  const active = items.filter((i) => i.result.revenue > 0 || i.hasContract)
  if (active.length === 0) return null

  const totalRevenue = active.reduce((s, i) => s + i.result.revenue, 0)
  const totalPay = active.reduce((s, i) => s + (i.result.blocked ? 0 : i.result.contractorPay), 0)
  const totalMine = active.reduce((s, i) => s + (i.result.blocked ? 0 : i.result.ownerShare), 0)

  return (
    <section className="rounded-xl border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/40">
        <Handshake className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-semibold flex-1">{monthLabel} 도급 정산</h2>
        <Link
          href="/dashboard/contractors"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          계약 보기
        </Link>
      </div>

      {/* 합계 — 사장님이 제일 먼저 봐야 하는 세 숫자 */}
      <div className="grid grid-cols-3 divide-x border-b text-center">
        <div className="py-3">
          <p className="text-[11px] text-muted-foreground">도급 현장 매출</p>
          <p className="text-sm font-bold mt-0.5">{formatWon(totalRevenue)}</p>
        </div>
        <div className="py-3">
          <p className="text-[11px] text-muted-foreground">도급비로 나갈 돈</p>
          <p className="text-sm font-bold mt-0.5 text-rose-600">{formatWon(totalPay)}</p>
        </div>
        <div className="py-3 bg-emerald-50/60">
          <p className="text-[11px] text-muted-foreground">내게 남는 돈</p>
          <p className="text-sm font-bold mt-0.5 text-emerald-700">{formatWon(totalMine)}</p>
        </div>
      </div>

      <div className="divide-y">
        {active.map((item) => (
          <SettlementRow key={item.workerId} month={month} item={item} />
        ))}
      </div>

      {manualRevenue > 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 border-t bg-amber-50 text-[11px] text-amber-900">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            이 달 장부에 직접 넣은 매출이 {formatWon(manualRevenue)} 있어요. 같은 현장이면
            두 번 잡히니 한쪽을 지워주세요.
          </span>
        </div>
      )}

      <p className="px-4 py-2.5 border-t text-[11px] text-muted-foreground leading-relaxed">
        정기청소는 방문 횟수와 상관없이 월정액을 한 번만 셉니다. 일회성은 &lsquo;완료&rsquo;로 찍은
        현장만 들어가요. 금액은 부가세 별도(공급가액) 기준입니다.
      </p>
    </section>
  )
}

function SettlementRow({ month, item }: { month: string; item: SettlementCardData }) {
  const [open, setOpen] = useState(false)
  const r = item.result

  const post = useAction(postSubcontractSettlementAction, {
    onSuccess: () => toast.success('장부에 넣었어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const unpost = useAction(unpostSubcontractSettlementAction, {
    onSuccess: () => toast.success('장부에서 뺐어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const busy = post.isPending || unpost.isPending

  const lines = [
    ...item.recurring.map((l) => ({
      key: `r-${l.contractId}`,
      name: l.clientName,
      detail:
        l.amount === l.monthlyPrice
          ? `정기 · 월정액 · ${l.visits}회 방문`
          : `정기 · 월정액 ${formatWon(l.monthlyPrice)} 중 ${l.visits}회분`,
      amount: l.amount,
    })),
    ...item.oneOff.map((l) => ({
      key: `o-${l.bookingId}`,
      name: l.clientName,
      detail: `일회성 · ${Number(l.date.slice(5, 7))}월 ${Number(l.date.slice(8, 10))}일 완료`,
      amount: l.amount,
    })),
  ]

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
          style={{ backgroundColor: item.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{item.workerName}</p>
            {r.sharePercent !== null && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                {r.sharePercent}:{100 - r.sharePercent}
              </span>
            )}
            {item.posted && (
              <span className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-600 text-white font-semibold">
                <CheckCircle2 className="h-3 w-3" />
                장부에 들어감
              </span>
            )}
          </div>

          {r.blocked ? (
            <div className="mt-1.5 space-y-2">
              <p className="text-xs text-amber-700">{r.blocked}</p>
              <p className="text-xs text-muted-foreground">
                이 달 현장 매출 {formatWon(r.revenue)}
              </p>
              {!item.hasContract && (
                <Button asChild variant="outline" size="sm" className="h-9 text-xs">
                  <Link href={`/dashboard/contractors/${item.workerId}`}>계약서 쓰기</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mt-1">
                매출 {formatWon(r.revenue)} · 도급비{' '}
                <span className="text-rose-600 font-medium">{formatWon(r.contractorPay)}</span> · 내 몫{' '}
                <span className="text-emerald-700 font-semibold">{formatWon(r.ownerShare)}</span>
              </p>

              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  현장 {lines.length}곳 자세히
                  <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
              )}

              {open && (
                <ul className="mt-2 space-y-1 rounded-lg bg-muted/50 p-2.5">
                  {lines.map((l) => (
                    <li key={l.key} className="flex items-baseline gap-2 text-[11px]">
                      <span className="flex-1 min-w-0 truncate">
                        {l.name}
                        <span className="text-muted-foreground"> · {l.detail}</span>
                      </span>
                      <span className="font-medium shrink-0">{formatWon(l.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2.5">
                {item.posted ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={busy}
                    onClick={() => unpost.execute({ workerId: item.workerId, month })}
                  >
                    {unpost.isPending ? '빼는 중...' : '장부에서 빼기'}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-9 text-xs"
                    disabled={busy || r.revenue <= 0}
                    onClick={() => post.execute({ workerId: item.workerId, month })}
                  >
                    {post.isPending ? '넣는 중...' : '장부에 넣기'}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
