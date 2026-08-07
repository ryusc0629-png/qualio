import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Users, FileText } from 'lucide-react'
import { getMonthlyPayroll, monthRangeUtc, currentMonthKst } from '@/lib/payroll/data'
import { formatWon } from '@/lib/finance/constants'
import { WorkerPayEditor, PostLedgerButton } from './payroll-client'

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
  const { label } = monthRangeUtc(month)
  const total = payroll.reduce((s, p) => s + p.amount, 0)
  const prevMonth = shiftMonth(month, -1)
  const nextMonth = shiftMonth(month, 1)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">급여 관리</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          현장 도착·마감 기록으로 직원·도급사 급여를 계산해요
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
            <span className="text-sm text-muted-foreground">이 달 급여 합계</span>
            <span className="text-2xl font-bold tabular-nums">{formatWon(total)}</span>
          </div>

          <div className="space-y-3">
            {payroll.map((p) => {
              const hasRate = !!(p.worker.pay_type && p.worker.pay_rate)
              return (
                <div key={p.worker.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">{p.worker.name}</span>
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                        {p.worker.type === 'contractor' ? '도급사' : '직원'}
                      </span>
                    </div>
                    <span className="text-lg font-bold tabular-nums shrink-0">
                      {hasRate ? formatWon(p.amount) : '—'}
                    </span>
                  </div>

                  {/* 단가 설정 */}
                  <WorkerPayEditor workerId={p.worker.id} payType={p.worker.pay_type} payRate={p.worker.pay_rate} />

                  {/* 근무 요약 */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>완료 {p.visitCount}건</span>
                    <span>근무 {p.hours ? p.hours.toFixed(1) : 0}시간</span>
                    <span>{p.workDays}일 근무</span>
                  </div>

                  {/* 안내 */}
                  {!hasRate ? (
                    <p className="text-xs text-amber-600">급여 방식과 단가를 저장하면 금액이 자동 계산돼요</p>
                  ) : p.worker.pay_type === 'hourly' && p.hours === 0 ? (
                    <p className="text-xs text-amber-600">
                      시급인데 근무시간 기록이 없어요 — 도착·마감(문단속) 사진이 있어야 시간이 잡혀요
                    </p>
                  ) : null}

                  {/* 액션 */}
                  <div className="flex gap-2 pt-1">
                    <Link
                      href={`/dashboard/payroll/${p.worker.id}?month=${month}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      명세서
                    </Link>
                    <PostLedgerButton workerId={p.worker.id} month={month} disabled={!hasRate || p.amount <= 0} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* 세금·이체 안내 */}
          <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
            여기서는 급여 <span className="font-medium text-foreground">금액 계산과 명세서, 장부 반영</span>까지 도와드려요.
            실제 계좌 이체와 4대보험·원천징수(세금 신고)는 사장님(또는 노무사)이 직접 처리해주세요.
          </div>
        </>
      )}
    </div>
  )
}
