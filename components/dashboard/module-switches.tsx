'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { enableModuleAction, disableModuleAction } from '@/lib/actions/modules'
import { MODULE_CARDS } from '@/lib/config/module-cards'
import { MODULES, type ModuleId } from '@/lib/config/modules'
import { formatMoney } from '@/lib/format/money'
import { withVat } from '@/lib/config/plans'

// 사장님이 기능을 켜고 끄는 화면.
//
// ★끌 때 "데이터는 그대로 남아요"를 반드시 보여준다 — 없어진다고 생각하면 아무도 못 끈다.
// ★켜면 금액이 바로 바뀌는 게 보여야 한다. 다음 청구서에서 알게 되면 그게 CS다.

interface Props {
  enabled: { moduleId: ModuleId; regions: number }[]
  monthly: number
  lines: { label: string; amount: number; detail?: string }[]
  basis: { workers: number; regions: number; recurringRevenue: number }
}

export function ModuleSwitches({ enabled, monthly, lines, basis }: Props) {
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<ModuleId | null>(null)

  const isOn = (id: ModuleId) => enabled.some((e) => e.moduleId === id)

  const toggle = (id: ModuleId, on: boolean) => {
    setBusy(id)
    startTransition(async () => {
      const res = on
        ? await disableModuleAction({ moduleId: id })
        : await enableModuleAction({ moduleId: id, regions: 1 })
      setBusy(null)
      if (res?.serverError) { toast.error(res.serverError); return }
      toast.success(on ? `${MODULES[id].label}을 껐어요. 자료는 그대로 있어요` : `${MODULES[id].label}을 켰어요`)
    })
  }

  return (
    <div className="space-y-6">
      {/* 지금 내는 돈 */}
      <div className="rounded-xl border bg-background p-5">
        <p className="text-xs font-semibold text-muted-foreground">이번 달 요금</p>
        <ul className="mt-3 space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.label} className="flex items-baseline justify-between gap-3">
              <span>
                {l.label}
                {l.detail && <span className="ml-1.5 text-xs text-muted-foreground">{l.detail}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{formatMoney(l.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t pt-3">
          <span className="font-semibold">한 달에</span>
          <span className="text-xl font-bold tabular-nums">
            {formatMoney(monthly)}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">부가세 별도</span>
          </span>
        </div>
        <p className="mt-1 text-right text-xs text-muted-foreground">
          실제 결제 {formatMoney(withVat(monthly))}
        </p>

        {(basis.workers > 0 || basis.recurringRevenue > 0) && (
          <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            지금 등록된 직원 {basis.workers}명
            {basis.recurringRevenue > 0 && ` · 정기계약 월 ${formatMoney(basis.recurringRevenue)}`}
            {' '}기준이에요. 직원이 늘거나 계약이 커지면 다음 달부터 그만큼만 올라가요.
          </p>
        )}
      </div>

      {/* 모듈 스위치 */}
      {MODULE_CARDS.filter((c) => !c.core).map((card) => {
        const id = (card.name === MODULES.field.label ? 'field'
          : card.name === MODULES.marketing.label ? 'marketing' : 'client') as ModuleId
        const on = isOn(id)
        return (
          <div key={card.name} className={`rounded-xl border p-5 ${on ? 'border-primary bg-primary/5' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{card.name}</h3>
                  {on && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                      쓰는 중
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{card.who}</p>
                <p className="mt-1 text-sm font-semibold">
                  {card.price}
                  {card.per && <span className="text-xs font-normal text-muted-foreground"> {card.per}</span>}
                </p>
              </div>
              <Button
                type="button"
                variant={on ? 'outline' : 'default'}
                className="h-11 shrink-0"
                disabled={pending}
                onClick={() => toggle(id, on)}
              >
                {busy === id ? <Loader2 className="h-4 w-4 animate-spin" /> : on ? '끄기' : '켜기'}
              </Button>
            </div>

            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {card.features.slice(0, 4).map((f) => (
                <li key={f.t} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{f.t}</span>
                </li>
              ))}
            </ul>

            {on && (
              <p className="mt-3 text-xs text-muted-foreground">
                끄셔도 <b className="text-foreground">그동안 쌓인 자료는 그대로 남아요.</b> 화면만 잠기고, 다시 켜면 돌아옵니다.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
