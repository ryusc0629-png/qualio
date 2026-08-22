import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Users, FileText, Wallet } from 'lucide-react'
import { getMonthlyPayroll, monthRangeUtc, currentMonthKst } from '@/lib/payroll/data'
import { formatWon } from '@/lib/finance/constants'
import { WorkerPayEditor, PostLedgerButton, PayrollExtras } from './payroll-client'

export const dynamic = 'force-dynamic'

// 'YYYY-MM'에서 delta개월 이동
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? '') ? monthParam! : currentMonthKst()

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')
  const db = createServiceClient()
  const { data: profile } = await db.from('profiles').select('business_id').eq('id', user.id).maybeSingle()
  if (!profile?.business_id) redirect('/onboarding')

  const payroll = await getMonthlyPayroll(db as unknown as SupabaseClient, profile.business_id, month)
  const { label, start, end } = monthRangeUtc(month)

  // 이 달에 기사별로 받아온 후기 수.
  // 고객에게 대가를 주는 대신(네이버 정책 위반) 현장에서 부탁한 기사에게 성과급을 준다.
  // 실제로 손님에게 말을 거는 사람이 움직여야 후기가 모인다.
  const { data: claimRows } = await db
    .from('review_claims')
    .select('worker_id' as never)
    .eq('business_id', profile.business_id)
    .not('worker_id', 'is', null)
    .not('claimed_at', 'is', null)
    .gte('claimed_at', start)
    .lt('claimed_at', end) as unknown as { data: { worker_id: string }[] | null }

  const reviewsByWorker = new Map<string, number>()
  for (const r of claimRows ?? []) {
    reviewsByWorker.set(r.worker_id, (reviewsByWorker.get(r.worker_id) ?? 0) + 1)
  }
  const totalReviews = claimRows?.length ?? 0
  const total = payroll.reduce((s, p) => s + p.amount, 0)
  const prevMonth = shiftMonth(month, -1)
  const nextMonth = shiftMonth(month, 1)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">급여 관리</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          현장 기록으로 직원·도급사에게 줄 돈을 계산해요
        </p>
      </div>

      {/* 월 이동 */}
      <div className="flex items-center justify-between rounded-xl border bg-card px-2 py-2">
        <Link href={`/dashboard/payroll?month=${prevMonth}`} className="p-2 rounded-lg hover:bg-muted" aria-label="이전 달">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="font-semibold">{label}</span>
        <Link href={`/dashboard/payroll?month=${nextMonth}`} className="p-2 rounded-lg hover:bg-muted" aria-label="다음 달">
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      {payroll.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-3">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">아직 등록된 직원·도급사가 없어요</p>
          <Link
            href="/dashboard/schedule"
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            직원 등록하러 가기
          </Link>
        </div>
      ) : (
        <>
          {/* 이 달 인건비 합계 */}
          <div className="rounded-xl border bg-emerald-50/40 border-emerald-200 p-4 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">이 달 나갈 급여·도급비</span>
            <span className="text-2xl font-bold tabular-nums">{formatWon(total)}</span>
          </div>

          {/* 이 달 받아온 후기 — 기사에게 성과급으로 얹으라는 신호 */}
          {totalReviews > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">이 달 받아온 후기</span>
                <span className="text-lg font-bold tabular-nums">{totalReviews}건</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                현장에서 손님께 한마디 건넨 사람이 받아온 숫자예요. 건당 얼마씩 얹어주시면 다음 달에 더 늘어나요.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {payroll.map((p) => {
              // 계산이 막혀 있고 따로 준 돈도 없으면 금액을 지어내지 않고 '—'로 둔다
              const showAmount = !p.baseBlocked || p.extraTotal !== 0
              return (
                <div key={p.worker.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">{p.worker.name}</span>
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                        {p.isContractor ? '도급사' : '직원'}
                      </span>
                    </div>
                    <span className="text-lg font-bold tabular-nums shrink-0">
                      {showAmount ? formatWon(p.amount) : '—'}
                    </span>
                  </div>

                  {/* 기본급 — 도급사는 계약서 배분 조건으로 자동, 직원은 방식·단가를 정한다 */}
                  {p.isContractor ? (
                    <div className="rounded-lg bg-muted/30 px-3 py-2 space-y-0.5">
                      <p className="text-xs text-muted-foreground">도급비</p>
                      <p className="text-sm font-medium">{p.baseLabel}</p>
                      <p className="text-sm tabular-nums">{formatWon(p.baseAmount)}</p>
                    </div>
                  ) : (
                    <>
                      <WorkerPayEditor workerId={p.worker.id} payType={p.worker.pay_type} payRate={p.worker.pay_rate} />
                      {!p.baseBlocked && (
                        <p className="text-xs text-muted-foreground">
                          기본급 {p.baseLabel} = <span className="font-medium text-foreground">{formatWon(p.baseAmount)}</span>
                        </p>
                      )}
                    </>
                  )}

                  {/* 근무 요약 */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>완료 {p.visitCount}건</span>
                    <span>근무 {p.hours ? p.hours.toFixed(1) : 0}시간</span>
                    <span>{p.workDays}일 근무</span>
                    {(reviewsByWorker.get(p.worker.id) ?? 0) > 0 && (
                      <span className="text-primary font-medium">
                        후기 {reviewsByWorker.get(p.worker.id)}건 받아옴
                      </span>
                    )}
                  </div>

                  {/* 안내 */}
                  {p.baseBlocked ? (
                    <p className="text-xs text-amber-600">
                      {p.baseBlocked}
                      {p.isContractor && (
                        <Link href={`/dashboard/contractors/${p.worker.id}`} className="ml-1 underline font-medium">
                          계약서 쓰러 가기
                        </Link>
                      )}
                    </p>
                  ) : p.worker.pay_type === 'hourly' && p.hours === 0 ? (
                    <p className="text-xs text-amber-600">
                      시급인데 근무시간 기록이 없어요 — 도착·마감(문단속) 사진이 있어야 시간이 잡혀요
                    </p>
                  ) : null}

                  {/* 현장마다 따로 준 돈 */}
                  <PayrollExtras
                    workerId={p.worker.id}
                    month={month}
                    extras={p.extras}
                    bookingOptions={p.bookingOptions}
                  />

                  {/* 액션 */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      href={`/dashboard/payroll/${p.worker.id}?month=${month}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      명세서
                    </Link>
                    {/* 도급비는 재무의 도급 정산에서 매출과 함께 한 번에 확정한다.
                        여기서 또 넣으면 같은 돈이 장부에 두 번 잡힌다. */}
                    {p.isContractor ? (
                      <Link
                        href="/dashboard/finance"
                        className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        도급 정산에서 장부에 넣기
                      </Link>
                    ) : (
                      <PostLedgerButton workerId={p.worker.id} month={month} disabled={!showAmount || p.amount <= 0} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 세금·이체 안내 */}
          <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
            여기서는 급여 <span className="font-medium text-foreground">금액 계산과 명세서, 장부 반영</span>까지 도와드려요.
            도급사 도급비는 계약서의 배분 조건으로 자동 계산되고, 장부에는 재무의 도급 정산에서 매출과 함께 들어가요.
            실제 계좌 이체와 4대보험·원천징수(세금 신고)는 사장님(또는 노무사)이 직접 처리해주세요.
          </div>
        </>
      )}
    </div>
  )
}
