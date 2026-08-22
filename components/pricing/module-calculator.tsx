'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Users, MapPin, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  BASE_PRICE, MODULES, CLIENT_RATE, CLIENT_MIN, CLIENT_MIN_THRESHOLD,
  quoteModules,
} from '@/lib/config/modules'
import { formatMoney } from '@/lib/format/money'
import { withVat } from '@/lib/config/plans'
import { applyLifetimeDiscount, BETA_LIFETIME_DISCOUNT_RATE } from '@/lib/config/beta'

// 요금 계산기 — 사장님이 자기 요금을 직접 만들어 보는 화면.
//
// ★비테크 40~60대가 쓴다. 계산은 복잡해도 **손대는 건 세 개**여야 한다:
//   직원 수 · 지역 수 · 정기 매출. 그 외엔 켜고 끄는 체크박스뿐.
// ⚠️금액은 반드시 quoteModules()로만 계산한다. 화면이 따로 더하면
//   결제 금액과 어긋나 "결제 금액이 올바르지 않습니다"가 난다.

const RECURRING_STEPS = [
  { label: '없어요', value: 0 },
  { label: '월 200만원쯤', value: 2_000_000 },
  { label: '월 500만원쯤', value: 5_000_000 },
  { label: '월 1,000만원쯤', value: 10_000_000 },
  { label: '월 3,000만원쯤', value: 30_000_000 },
  { label: '월 5,000만원쯤', value: 50_000_000 },
  { label: '월 1억쯤', value: 100_000_000 },
]

export function ModuleCalculator({ betaOpen }: { betaOpen: boolean }) {
  const [workers, setWorkers] = useState(0)
  const [regions, setRegions] = useState(0)
  const [recurring, setRecurring] = useState(0)

  const quote = quoteModules({ workers, regions, recurringRevenue: recurring })
  const beta = applyLifetimeDiscount(quote.monthly, BETA_LIFETIME_DISCOUNT_RATE)

  return (
    <div className="rounded-2xl border bg-card p-6 sm:p-8">
      <h3 className="text-lg font-bold">내 요금 계산해 보기</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        세 가지만 고르시면 됩니다. 안 쓰시는 건 &lsquo;없어요&rsquo;로 두세요.
      </p>

      <div className="mt-6 space-y-6">
        {/* 직원 */}
        <Field
          icon={<Users className="h-4 w-4" />}
          title="직원·도급 기사님이 몇 분이세요?"
          hint={`${MODULES.field.label} — 한 분당 ${formatMoney(MODULES.field.price)}`}
        >
          <div className="flex flex-wrap gap-2">
            {[0, 1, 3, 5, 10, 20].map((n) => (
              <Choice key={n} on={workers === n} onClick={() => setWorkers(n)}>
                {n === 0 ? '혼자예요' : `${n}명`}
              </Choice>
            ))}
          </div>
        </Field>

        {/* 지역 */}
        <Field
          icon={<MapPin className="h-4 w-4" />}
          title="홍보는 몇 개 지역에서 하세요?"
          hint={`${MODULES.marketing.label} — 지역당 ${formatMoney(MODULES.marketing.price)}`}
        >
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((n) => (
              <Choice key={n} on={regions === n} onClick={() => setRegions(n)}>
                {n === 0 ? '홍보는 안 해요' : `${n}개 지역`}
              </Choice>
            ))}
          </div>
          {regions > 1 && (
            <p className="mt-2 text-xs text-muted-foreground">
              지역을 늘리려면 내 인터넷 주소(도메인) 연결이 먼저예요. 저희가 대신 해드립니다.
            </p>
          )}
        </Field>

        {/* 거래처 */}
        <Field
          icon={<Building2 className="h-4 w-4" />}
          title="빌딩·사무실 정기계약으로 매달 얼마나 받으세요?"
          hint={`${MODULES.client.label} — 그 금액의 ${(CLIENT_RATE * 100).toFixed(0)}%, 최소 ${formatMoney(CLIENT_MIN)}`}
        >
          <div className="flex flex-wrap gap-2">
            {RECURRING_STEPS.map((s) => (
              <Choice key={s.value} on={recurring === s.value} onClick={() => setRecurring(s.value)}>
                {s.label}
              </Choice>
            ))}
          </div>
          {recurring > 0 && recurring <= CLIENT_MIN_THRESHOLD && (
            <p className="mt-2 text-xs text-muted-foreground">
              정기 매출 {formatMoney(CLIENT_MIN_THRESHOLD)}까지는 {formatMoney(CLIENT_MIN)} 그대로예요.
            </p>
          )}
        </Field>
      </div>

      {/* 계산 결과 */}
      <div className="mt-8 rounded-xl border bg-background p-5">
        <ul className="space-y-2 text-sm">
          {quote.lines.map((l) => (
            <li key={l.label} className="flex items-baseline justify-between gap-3">
              <span>
                {l.label}
                {l.detail && <span className="ml-1.5 text-xs text-muted-foreground">{l.detail}</span>}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatMoney(l.amount)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-baseline justify-between gap-3 border-t pt-4">
          <span className="font-semibold">한 달에</span>
          <span className="text-2xl font-bold tabular-nums">
            {formatMoney(quote.monthly)}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">부가세 별도</span>
          </span>
        </div>
        <p className="mt-1 text-right text-xs text-muted-foreground">
          실제 결제 {formatMoney(withVat(quote.monthly))}
        </p>

        {betaOpen && (
          <p className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-center text-xs font-medium text-primary">
            베타로 가입하시면 절반 — 한 달 {formatMoney(beta)} (부가세 별도)
          </p>
        )}

        <p className="mt-3 text-center text-xs text-muted-foreground">
          1년치를 먼저 내시면 10% 깎아드려요 · 연 {formatMoney(quote.annual)}
        </p>
      </div>

      <Button asChild className="mt-5 h-12 w-full">
        <Link href="/signup">무료로 시작하기</Link>
      </Button>
    </div>
  )
}

function Field({
  icon, title, hint, children,
}: { icon: React.ReactNode; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="mb-2.5 text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  )
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-11 rounded-lg border px-4 text-sm transition-colors',
        on ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border hover:bg-muted',
      ].join(' ')}
    >
      {on && <Check className="mr-1.5 inline h-3.5 w-3.5" />}
      {children}
    </button>
  )
}

export { BASE_PRICE }
