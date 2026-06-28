import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddContractForm } from '@/components/dashboard/add-contract-form'
import { ContractStatusSelect } from '@/components/dashboard/contract-status-select'
import { formatFrequency } from '@/lib/utils/frequency'

const STATUS_META: Record<string, { label: string; className: string }> = {
  active:     { label: '활성',  className: 'bg-green-100 text-green-700' },
  paused:     { label: '중단',  className: 'bg-yellow-100 text-yellow-700' },
  terminated: { label: '해지',  className: 'bg-red-100 text-red-600' },
}

export default async function ContractsPage() {
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

  // 계약 목록 (고객 정보 조인)
  const { data: contracts } = await db
    .from('contracts')
    .select('id, customer_id, service_type, frequency, contract_price, start_date, end_date, status, notes, customers!contracts_customer_id_fkey(name, phone)')
    .eq('business_id', profile.business_id)
    .order('created_at', { ascending: false })

  // 고객 목록 (계약 등록 폼용)
  const { data: customers } = await db
    .from('customers')
    .select('id, name, phone')
    .eq('business_id', profile.business_id)
    .order('name')

  // 계약별 자동 생성 방문 집계 — 다음 예정일 + 완료 횟수
  const contractIds = (contracts ?? []).map((c) => c.id)
  const visitInfo = new Map<string, { nextVisit: string | null; completed: number }>()
  if (contractIds.length > 0) {
    const { data: visits } = await db
      .from('bookings' as never)
      .select('contract_id, scheduled_at, status' as never)
      .in('contract_id' as never, contractIds)
      .is('deleted_at' as never, null) as unknown as {
        data: { contract_id: string | null; scheduled_at: string; status: string }[] | null
      }
    const nowIso = new Date().toISOString()
    for (const v of visits ?? []) {
      if (!v.contract_id) continue
      const cur = visitInfo.get(v.contract_id) ?? { nextVisit: null, completed: 0 }
      if (v.status === 'completed') cur.completed++
      // 다음 예정 방문: 아직 안 끝났고 미래인 것 중 가장 빠른 날짜
      if (
        ['confirmed', 'in_progress'].includes(v.status) &&
        v.scheduled_at > nowIso &&
        (cur.nextVisit === null || v.scheduled_at < cur.nextVisit)
      ) {
        cur.nextVisit = v.scheduled_at
      }
      visitInfo.set(v.contract_id, cur)
    }
  }

  // 확정 정기 매출 (활성 계약 합산)
  const monthlyRevenue = (contracts ?? [])
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + c.contract_price, 0)

  const activeCount = (contracts ?? []).filter((c) => c.status === 'active').length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">정기계약</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            정기 고객의 계약을 관리하고 매출을 확인하세요
          </p>
        </div>
        <AddContractForm customers={customers ?? []} />
      </div>

      {/* 매출 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-gradient-to-br from-green-50 to-emerald-50 p-5">
          <p className="text-sm text-green-700 font-medium">확정 정기 매출</p>
          <p className="text-3xl font-bold text-green-800 mt-2">
            {monthlyRevenue > 0
              ? `${monthlyRevenue.toLocaleString('ko-KR')}원`
              : '—'}
          </p>
          <p className="text-xs text-green-600 mt-1">활성 계약 기준 월 합계</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">활성 계약</p>
          <p className="text-3xl font-bold mt-2">
            {activeCount}
            <span className="text-base font-normal text-muted-foreground ml-1">건</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">전체 {contracts?.length ?? 0}건 중</p>
        </div>
      </div>

      {/* 계약 목록 */}
      {!contracts || contracts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">등록된 정기계약이 없습니다</p>
          <p className="text-xs text-muted-foreground mt-1">
            고객 관리에서 정기 고객을 등록한 후 계약을 추가하세요
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">고객명</th>
                <th className="text-left px-4 py-3 font-medium">서비스</th>
                <th className="text-left px-4 py-3 font-medium">주기</th>
                <th className="text-right px-4 py-3 font-medium">월 금액</th>
                <th className="text-left px-4 py-3 font-medium">시작일</th>
                <th className="text-left px-4 py-3 font-medium">종료일</th>
                <th className="text-left px-4 py-3 font-medium">다음 방문</th>
                <th className="text-center px-4 py-3 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => {
                const customer = Array.isArray(contract.customers)
                  ? contract.customers[0]
                  : contract.customers
                const visits = visitInfo.get(contract.id)

                return (
                  <tr key={contract.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      {customer?.name ?? '—'}
                      {customer?.phone && (
                        <p className="text-xs text-muted-foreground font-normal">{customer.phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{contract.service_type}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatFrequency(contract.frequency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {contract.contract_price.toLocaleString('ko-KR')}원
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(contract.start_date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {contract.end_date
                        ? new Date(contract.end_date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
                        : <span className="text-xs">무기한</span>}
                    </td>
                    <td className="px-4 py-3">
                      {visits?.nextVisit ? (
                        <span className="text-emerald-700 font-medium">
                          {new Date(visits.nextVisit).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{contract.status === 'active' ? '예정 없음' : '—'}</span>
                      )}
                      {visits && visits.completed > 0 && (
                        <p className="text-[11px] text-muted-foreground font-normal mt-0.5">{visits.completed}회 완료</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ContractStatusSelect
                        contractId={contract.id}
                        currentStatus={contract.status}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
