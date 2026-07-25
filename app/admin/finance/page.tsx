import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminMetrics } from '@/lib/admin/metrics'
import { formatMoney } from '@/lib/format/money'
import { FINANCE_CATEGORIES, CATEGORY_MAP } from '@/lib/admin/finance-categories'
import { FinanceClient, type HqSubscription, type HqExpense } from './finance-client'

// 항상 최신 재무 데이터를 보여준다(캐시 금지)
export const dynamic = 'force-dynamic'

// 이번 달(KST) 경계 계산
function monthRangeKST(): { first: string; nextFirst: string; label: string } {
  const now = new Date()
  const ym = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(now) // "2026-07"
  const [y, mo] = ym.split('-').map(Number)
  const nextY = mo === 12 ? y + 1 : y
  const nextMo = mo === 12 ? 1 : mo + 1
  return {
    first: `${ym}-01`,
    nextFirst: `${nextY}-${String(nextMo).padStart(2, '0')}-01`,
    label: `${y}년 ${mo}월`,
  }
}

function subMonthlyKrw(s: HqSubscription, rate: number): number {
  const base = s.currency === 'USD' ? s.amount * rate : s.amount
  return Math.round(s.cycle === 'yearly' ? base / 12 : base)
}

export default async function HqFinancePage() {
  const db = createServiceClient() as unknown as SupabaseClient
  const { first, nextFirst, label } = monthRangeKST()

  const [metrics, subsRes, expRes, settingsRes] = await Promise.all([
    getAdminMetrics(),
    db.from('hq_subscriptions').select('*').eq('active', true).order('created_at', { ascending: true }),
    db
      .from('hq_expenses')
      .select('*')
      .gte('spent_on', first)
      .lt('spent_on', nextFirst)
      .order('spent_on', { ascending: false }),
    db.from('hq_settings').select('usd_krw_rate').eq('id', 1).maybeSingle(),
  ])

  const subscriptions = (subsRes.data ?? []) as unknown as HqSubscription[]
  const expenses = (expRes.data ?? []) as unknown as HqExpense[]
  const rate = ((settingsRes.data as unknown as { usd_krw_rate: number } | null)?.usd_krw_rate) ?? 1400

  const mrr = metrics.revenue.mrr

  // 분류별 월 비용 집계 (구독=월 환산, 지출=이번 달 원화)
  const byCategory: Record<string, number> = {}
  for (const s of subscriptions) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + subMonthlyKrw(s, rate)
  }
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + Math.round(e.amount_krw)
  }

  const cogsCats = FINANCE_CATEGORIES.filter((c) => c.costType === 'cogs')
  const opexCats = FINANCE_CATEGORIES.filter((c) => c.costType === 'opex')
  const sumCats = (cats: typeof FINANCE_CATEGORIES) =>
    cats.reduce((sum, c) => sum + (byCategory[c.id] ?? 0), 0)

  const cogsTotal = sumCats(cogsCats)
  const opexTotal = sumCats(opexCats)
  const totalCost = cogsTotal + opexTotal
  const grossProfit = mrr - cogsTotal
  const grossMargin = mrr > 0 ? grossProfit / mrr : 0
  const operatingIncome = mrr - totalCost
  const profitable = operatingIncome >= 0

  const catLine = (id: string) => ({ label: CATEGORY_MAP[id].label, color: CATEGORY_MAP[id].color, amount: byCategory[id] ?? 0 })
  const cogsLines = cogsCats.map((c) => catLine(c.id)).filter((l) => l.amount > 0)
  const opexLines = opexCats.map((c) => catLine(c.id)).filter((l) => l.amount > 0)

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">본사 재무 (손익)</h1>
        <span className="text-xs text-muted-foreground">{label} 기준</span>
      </div>

      {/* 한 줄 설명 — 이 화면의 본질 */}
      <p className="mb-4 text-sm text-muted-foreground break-keep">
        이번 달 <b className="text-foreground">번 돈(매출)</b>에서{' '}
        <b className="text-foreground">쓴 돈(매입·지출)</b>을 빼면{' '}
        <b className="text-foreground">순이익</b>이에요. 아래에 정기결제·지출만 입력하면 자동으로 계산됩니다.
      </p>

      {/* 이번 달 요약 — 매출 / 매입·지출 / 순이익 */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-emerald-50/40 border-emerald-200 p-4">
          <p className="text-xs text-muted-foreground">💰 매출 (버는 돈)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(mrr)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">고객 구독료(월) 자동 집계</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">💸 매입·지출 (쓰는 돈)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(totalCost)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">정기결제 + 이번 달 지출</p>
        </div>
        <div className={`rounded-lg border p-4 ${profitable ? 'bg-emerald-50/40 border-emerald-200' : 'bg-red-50/40 border-red-200'}`}>
          <p className="text-xs text-muted-foreground">📊 순이익 (남는 돈)</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${profitable ? 'text-emerald-700' : 'text-red-600'}`}>
            {formatMoney(operatingIncome)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium">{profitable ? '흑자 ✓' : '적자'}</p>
        </div>
      </div>

      {/* 손익계산서 — 평소엔 접어둠, 매각 대비 상세(선택) */}
      <details className="mb-8 rounded-xl border bg-background p-5">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          <span className="text-base font-semibold">🧮 손익계산서 자세히 보기</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">매각 대비 · 선택 (평소엔 안 봐도 돼요)</span>
        </summary>
        <p className="mt-2 mb-4 text-xs text-muted-foreground break-keep">
          나중에 회사를 팔 때 인수자가 보는 구조예요. 비용을 매출원가(서비스에 직접 드는 돈)와
          판관비(그 외 운영비)로 나눠 매출총이익률까지 자동 계산합니다. 입력은 신경 안 쓰셔도 돼요 —
          항목만 고르면 자동으로 나뉩니다.
        </p>

        <div className="space-y-1.5 text-sm">
          <StatementRow label="매출 (MRR)" amount={formatMoney(mrr)} bold />

          <StatementRow label="(−) 매출원가 (COGS)" amount={`−${formatMoney(cogsTotal)}`} muted />
          {cogsLines.map((l) => (
            <SubLine key={l.label} label={l.label} color={l.color} amount={formatMoney(l.amount)} />
          ))}

          <div className="my-1 border-t" />
          <StatementRow
            label="= 매출총이익"
            amount={formatMoney(grossProfit)}
            bold
            sub={mrr > 0 ? `마진 ${(grossMargin * 100).toFixed(1)}%` : undefined}
          />

          <StatementRow label="(−) 판관비 (OpEx)" amount={`−${formatMoney(opexTotal)}`} muted />
          {opexLines.map((l) => (
            <SubLine key={l.label} label={l.label} color={l.color} amount={formatMoney(l.amount)} />
          ))}

          <div className="my-1 border-t-2 border-foreground/20" />
          <StatementRow
            label="= 영업이익 (순이익)"
            amount={formatMoney(operatingIncome)}
            bold
            accent={profitable ? 'emerald' : 'red'}
          />
        </div>

        {cogsLines.length === 0 && opexLines.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed bg-muted/30 p-3 text-center text-xs text-muted-foreground">
            아직 비용이 없어요. 아래에서 정기결제(구독)와 지출을 등록하면 손익이 자동으로 채워집니다.
          </p>
        )}
      </details>

      {/* 구독·지출·환율 — 인터랙션 */}
      <FinanceClient subscriptions={subscriptions} expenses={expenses} rate={rate} />
    </div>
  )
}

// ── 손익계산서 표시용 ──
function StatementRow({
  label,
  amount,
  bold,
  muted,
  sub,
  accent,
}: {
  label: string
  amount: string
  bold?: boolean
  muted?: boolean
  sub?: string
  accent?: 'emerald' | 'red'
}) {
  const color = accent === 'emerald' ? 'text-emerald-700' : accent === 'red' ? 'text-red-600' : ''
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground' : ''}`}>
        {label}
        {sub && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{sub}</span>}
      </span>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${color}`}>{amount}</span>
    </div>
  )
}

function SubLine({ label, color, amount }: { label: string; color: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pl-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="tabular-nums">{amount}</span>
    </div>
  )
}
