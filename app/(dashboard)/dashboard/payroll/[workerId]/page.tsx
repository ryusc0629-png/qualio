import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getMonthlyPayroll, monthRangeUtc, currentMonthKst } from '@/lib/payroll/data'
import { PAY_TYPE_LABEL, PAY_TYPE_UNIT, hoursBetween } from '@/lib/payroll/compute'
import { formatWon } from '@/lib/finance/constants'
import { PrintPayslipButton } from './print-button'
import { PostLedgerButton } from '../payroll-client'

export const dynamic = 'force-dynamic'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })
}

export default async function PayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ workerId: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { workerId } = await params
  const { month: monthParam } = await searchParams
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? '') ? monthParam! : currentMonthKst()

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')
  const db = createServiceClient()
  const { data: profile } = await db.from('profiles').select('business_id, businesses!business_id(name)').eq('id', user.id).maybeSingle()
  const businessId = profile?.business_id
  if (!businessId) redirect('/onboarding')
  const businessName = (profile?.businesses as { name: string } | null)?.name ?? '우리 업체'

  const payroll = await getMonthlyPayroll(db as unknown as SupabaseClient, businessId, month)
  const p = payroll.find((x) => x.worker.id === workerId)
  if (!p) notFound()

  const { label } = monthRangeUtc(month)
  // 계산이 막혀 있고 따로 준 돈도 없으면 금액을 지어내지 않는다
  const showAmount = !p.baseBlocked || p.extraTotal !== 0
  const rateText = p.isContractor
    ? '도급 계약서 정산 조건'
    : p.worker.pay_type && p.worker.pay_rate
      ? `${formatWon(p.worker.pay_rate)} ${PAY_TYPE_UNIT[p.worker.pay_type].replace('원', '')} (${PAY_TYPE_LABEL[p.worker.pay_type]})`
      : '단가 미설정'

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 상단 액션 (인쇄 시 숨김) */}
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/dashboard/payroll?month=${month}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> 급여 관리
        </Link>
        <div className="flex gap-2">
          <PrintPayslipButton />
          {/* 도급비는 재무의 도급 정산에서 매출과 함께 확정한다(같은 돈을 두 번 잡지 않기 위해) */}
          {!p.isContractor && (
            <PostLedgerButton workerId={p.worker.id} month={month} disabled={!showAmount || p.amount <= 0} />
          )}
        </div>
      </div>

      {/* 브라우저가 인쇄 시 종이 가장자리에 찍는 머리글·바닥글 제거.
          직원에게 주는 명세서라 날짜·주소가 찍히면 문서로 안 보인다.
          여백을 0으로 없앤 대신 본문 padding으로 여백을 만든다. */}
      <style>{`@page { size: A4; margin: 0; }`}</style>

      {/* 명세서 본문 */}
      <div className="rounded-xl border bg-white p-6 space-y-5 print:border-0 print:p-[15mm]">
        <div className="text-center border-b pb-4">
          <h1 className="text-xl font-bold">급여 명세서</h1>
          <p className="text-sm text-muted-foreground mt-1">{businessName} · {label}</p>
        </div>

        {/* 대상·요약 */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="이름" value={p.worker.name} />
          <Field label="구분" value={p.worker.type === 'contractor' ? '도급사' : '직원'} />
          <Field label="급여 방식" value={rateText} />
          <Field label="지급 대상 기간" value={label} />
          <Field label="완료 건수" value={`${p.visitCount}건`} />
          <Field label="근무시간" value={`${p.hours ? p.hours.toFixed(1) : 0}시간`} />
          <Field label="근무일수" value={`${p.workDays}일`} />
        </div>

        {/* 근무 내역 */}
        <div>
          <p className="text-sm font-semibold mb-2">근무 내역</p>
          {p.visits.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">이 달 완료된 방문이 없어요</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">날짜</th>
                    <th className="text-left font-medium px-3 py-2">현장</th>
                    <th className="text-right font-medium px-3 py-2">근무시간</th>
                  </tr>
                </thead>
                <tbody>
                  {p.visits.map((v) => {
                    const h = hoursBetween(v.checkin_at, v.checkout_at)
                    return (
                      <tr key={v.id} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(v.scheduled_at)}</td>
                        <td className="px-3 py-2">
                          <span className="block">{v.customer_name ?? '고객'}</span>
                          {v.service_address && <span className="block text-xs text-muted-foreground truncate">{v.service_address}</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{h ? `${h.toFixed(1)}h` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 지급 내역 — 기본급 + 따로 준 돈 */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">
              기본급 <span className="text-foreground">{p.baseLabel}</span>
            </span>
            <span className="tabular-nums">{formatWon(p.baseAmount)}</span>
          </div>
          {p.extras.map((e) => (
            <div key={e.id} className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground min-w-0 truncate">
                <span className="text-foreground">{e.label}</span>
                {e.bookingLabel && <span className="ml-1 text-xs">({e.bookingLabel})</span>}
              </span>
              <span className="tabular-nums">{formatWon(e.amount)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="font-semibold">지급액 합계</span>
            <span className="text-2xl font-bold tabular-nums">
              {showAmount ? formatWon(p.amount) : '단가 미설정'}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          ※ 위 금액은 근무 기록으로 계산한 것으로, 실제 지급액은 세금(4대보험·원천징수)·수당 등에 따라 달라질 수 있어요.
        </p>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
