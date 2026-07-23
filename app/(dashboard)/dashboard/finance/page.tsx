import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, Receipt } from 'lucide-react'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  formatWon,
  formatManwon,
  DEFAULT_CONTRIBUTION_MARGIN,
} from '@/lib/finance/constants'
import { AddEntryForm } from '@/components/dashboard/finance/add-entry-form'
import { FixedCostsManager, type FixedCost } from '@/components/dashboard/finance/fixed-costs-manager'
import { DeleteEntryButton } from '@/components/dashboard/finance/delete-entry-button'
import { BreakEvenGauge, DailyBarChart, CategoryDonut } from '@/components/dashboard/finance/charts'

// 현재 KST 기준 'YYYY-MM'
function currentMonthKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`
}

// 'YYYY-MM' → 이전/다음 달
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// 전월 대비 증감 배지
function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-xs text-muted-foreground">전월과 같음</span>
  const up = delta > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      전월 대비 {up ? '+' : '-'}{formatManwon(Math.abs(delta))}원
    </span>
  )
}

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

export default async function FinancePage({ searchParams }: PageProps) {
  const { month: monthParam } = await searchParams

  // 인증 + 업체ID
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) redirect('/onboarding')
  const businessId = profile.business_id

  // 조회 월 결정(유효성 검사)
  const thisMonth = currentMonthKST()
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : thisMonth
  const prevMonth = shiftMonth(month, -1)
  const nextMonth = shiftMonth(month, 1)
  const isCurrentMonth = month >= thisMonth
  const [yearNum, monthNum] = month.split('-').map(Number)

  const dim = daysInMonth(month)
  const monthStart = `${month}-01`
  const monthEnd = `${month}-${String(dim).padStart(2, '0')}`
  const prevDim = daysInMonth(prevMonth)
  const prevStart = `${prevMonth}-01`
  const prevEnd = `${prevMonth}-${String(prevDim).padStart(2, '0')}`

  // 데이터 병렬 조회
  const [
    { data: entries },
    { data: prevEntries },
    { data: fixedCostsRaw },
  ] = await Promise.all([
    db.from('finance_entries')
      .select('id, entry_date, type, category, amount, memo')
      .eq('business_id', businessId)
      .gte('entry_date', monthStart)
      .lte('entry_date', monthEnd)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false }),
    db.from('finance_entries')
      .select('type, amount')
      .eq('business_id', businessId)
      .gte('entry_date', prevStart)
      .lte('entry_date', prevEnd),
    db.from('fixed_costs')
      .select('id, name, monthly_amount, active')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true }),
  ])

  const rows = entries ?? []
  const fixedCosts: FixedCost[] = fixedCostsRaw ?? []

  // 이번 달 집계
  const revenue = rows.filter((r) => r.type === 'revenue').reduce((s, r) => s + r.amount, 0)
  const variableExpense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const fixedTotal = fixedCosts.filter((c) => c.active).reduce((s, c) => s + c.monthly_amount, 0)
  const totalExpense = variableExpense + fixedTotal
  const netProfit = revenue - totalExpense
  const hasFixed = fixedTotal > 0

  // 공헌이익률 & 손익분기점
  const margin = revenue > 0
    ? Math.max(0.05, Math.min(1, (revenue - variableExpense) / revenue))
    : DEFAULT_CONTRIBUTION_MARGIN
  const breakEvenRevenue = hasFixed ? Math.round(fixedTotal / margin) : 0
  const achievementPct = breakEvenRevenue > 0 ? (revenue / breakEvenRevenue) * 100 : revenue > 0 ? 100 : 0
  const remaining = Math.max(0, breakEvenRevenue - revenue)

  // 전월 대비
  const prevRows = prevEntries ?? []
  const prevRevenue = prevRows.filter((r) => r.type === 'revenue').reduce((s, r) => s + r.amount, 0)
  const prevVariable = prevRows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const revenueDelta = revenue - prevRevenue
  const expenseDelta = variableExpense - prevVariable

  // 일별 시리즈
  const daily = Array.from({ length: dim }, (_, i) => ({ day: i + 1, revenue: 0, expense: 0 }))
  for (const r of rows) {
    const day = Number(r.entry_date.slice(8, 10))
    if (day >= 1 && day <= dim) {
      if (r.type === 'revenue') daily[day - 1].revenue += r.amount
      else daily[day - 1].expense += r.amount
    }
  }

  // 지출 분류별(도넛)
  const expenseByCat = new Map<string, number>()
  for (const r of rows) {
    if (r.type === 'expense') expenseByCat.set(r.category, (expenseByCat.get(r.category) ?? 0) + r.amount)
  }
  const catItems = [...expenseByCat.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)

  const hasAnyData = rows.length > 0 || fixedCosts.length > 0

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">매출·지출 장부</h1>
          <p className="text-sm text-muted-foreground mt-1">매일 벌고 쓴 돈을 기록하면 손익이 한눈에 보여요</p>
        </div>
        <AddEntryForm />
      </div>

      {/* 월 이동 */}
      <div className="flex items-center justify-center gap-2">
        <Link
          href={`/dashboard/finance?month=${prevMonth}`}
          className="w-9 h-9 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-[120px] text-center font-semibold">
          {yearNum}년 {monthNum}월
        </div>
        {isCurrentMonth ? (
          <span className="w-9 h-9 rounded-lg border flex items-center justify-center opacity-30" aria-hidden>
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : (
          <Link
            href={`/dashboard/finance?month=${nextMonth}`}
            className="w-9 h-9 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="다음 달"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {!hasAnyData ? (
        /* 완전 빈 상태 — 온보딩 */
        <div className="rounded-2xl border bg-white p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Wallet className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold">아직 기록이 없어요</p>
            <p className="text-sm text-muted-foreground">
              오늘 번 돈·쓴 돈을 하나씩 기록해보세요.<br />
              고정비를 먼저 넣으면 &lsquo;본전 지점&rsquo;까지 계산해드려요.
            </p>
          </div>
          <div className="space-y-2 max-w-xs mx-auto">
            <AddEntryForm fullWidth triggerLabel="첫 기록 추가하기" />
            <FixedCostsManager costs={fixedCosts} variant="cta" />
          </div>
        </div>
      ) : (
        <>
          {/* 순이익 히어로 */}
          <div
            className={`rounded-2xl p-6 text-white shadow-sm ${
              netProfit >= 0
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-700'
                : 'bg-gradient-to-br from-slate-600 to-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
              <Wallet className="h-4 w-4" />
              {monthNum}월 순이익 {netProfit >= 0 ? '(남은 돈)' : '(부족한 돈)'}
            </div>
            <p className="text-4xl font-extrabold mt-2 tabular-nums">
              {netProfit >= 0 ? '' : '-'}{formatWon(Math.abs(netProfit))}
            </p>
            <div className="flex items-center gap-4 mt-4 text-sm">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-white/70" />
                <span className="text-white/70">매출</span>
                <span className="font-semibold tabular-nums">{formatWon(revenue)}</span>
              </div>
              <div className="w-px h-4 bg-white/25" />
              <div className="flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-white/70" />
                <span className="text-white/70">지출</span>
                <span className="font-semibold tabular-nums">{formatWon(totalExpense)}</span>
              </div>
            </div>
          </div>

          {/* KPI 3종 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-emerald-500" /> 매출
              </div>
              <p className="text-xl font-bold mt-1.5 tabular-nums">{formatWon(revenue)}</p>
              <div className="mt-1"><DeltaBadge delta={revenueDelta} /></div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Receipt className="h-4 w-4 text-rose-400" /> 지출(변동비)
              </div>
              <p className="text-xl font-bold mt-1.5 tabular-nums">{formatWon(variableExpense)}</p>
              <div className="mt-1"><DeltaBadge delta={expenseDelta} /></div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Wallet className="h-4 w-4 text-slate-400" /> 월 고정비
                </div>
                <FixedCostsManager costs={fixedCosts} />
              </div>
              <p className="text-xl font-bold mt-1.5 tabular-nums">{formatWon(fixedTotal)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {hasFixed ? `${fixedCosts.filter((c) => c.active).length}개 항목` : '아직 없어요 · 설정하기'}
              </p>
            </div>
          </div>

          {/* 손익분기점 게이지 */}
          <div className="rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-bold">손익분기점</h2>
                <p className="text-xs text-muted-foreground">이번 달 이만큼 벌면 &lsquo;본전&rsquo;이에요</p>
              </div>
              {hasFixed && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">공헌이익률</p>
                  <p className="text-sm font-bold text-primary">{Math.round(margin * 100)}%</p>
                </div>
              )}
            </div>
            <BreakEvenGauge
              achievementPct={achievementPct}
              breakEvenRevenue={breakEvenRevenue}
              revenue={revenue}
              remaining={remaining}
              hasFixed={hasFixed}
            />
          </div>

          {/* 일별 추이 */}
          <div className="rounded-2xl border bg-white p-5">
            <h2 className="font-bold mb-3">일별 매출·지출 흐름</h2>
            <DailyBarChart days={daily} />
          </div>

          {/* 지출 분류 도넛 */}
          {catItems.length > 0 && (
            <div className="rounded-2xl border bg-white p-5">
              <h2 className="font-bold mb-4">돈이 어디로 나갔나요</h2>
              <CategoryDonut items={catItems} total={variableExpense} />
            </div>
          )}

          {/* 최근 기록 */}
          <div className="rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold">{monthNum}월 기록</h2>
              <span className="text-xs text-muted-foreground">{rows.length}건</span>
            </div>
            {rows.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-muted-foreground">이 달엔 아직 기록이 없어요</p>
                <div className="max-w-[200px] mx-auto">
                  <AddEntryForm fullWidth triggerLabel="기록 추가하기" />
                </div>
              </div>
            ) : (
              <ul className="divide-y">
                {rows.map((r) => {
                  const isRev = r.type === 'revenue'
                  const md = `${Number(r.entry_date.slice(5, 7))}월 ${Number(r.entry_date.slice(8, 10))}일`
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-3">
                      <span
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isRev ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                        }`}
                      >
                        {isRev ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.category}
                          {r.memo && <span className="text-muted-foreground font-normal"> · {r.memo}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{md}</p>
                      </div>
                      <span className={`font-bold tabular-nums shrink-0 ${isRev ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {isRev ? '+' : '-'}{formatWon(r.amount)}
                      </span>
                      <DeleteEntryButton id={r.id} label={`${r.category} ${formatWon(r.amount)}`} />
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
