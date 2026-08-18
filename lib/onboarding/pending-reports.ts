import type { SupabaseClient } from '@supabase/supabase-js'

// "첫 작업은 끝났는데 초도 리포트를 아직 안 보낸 정기계약"을 찾는다.
//
// 홈 화면 알림과 대표 푸시가 같은 기준을 써야 한다 — 한쪽에만 뜨면
// "푸시는 왔는데 화면엔 없네" 같은 혼란이 생긴다. 그래서 이 함수 하나만 쓴다.
//
// 조건: 활성 정기계약 + 완료된 방문 1건 이상 + 초도 리포트를 아직 거래처에 안 보냄
// (리포트를 쓰다 만 draft 상태도 '보낼 차례'로 본다 — 끝까지 보내야 의미가 있다)

export interface PendingOnboardingReport {
  contractId: string
  customerId: string
  customerName: string
}

export async function countPendingOnboardingReports(
  db: SupabaseClient,
  businessId: string,
): Promise<PendingOnboardingReport[]> {
  const { data: contracts } = (await db
    .from('contracts')
    .select('id, customer_id, customers!contracts_customer_id_fkey(name)')
    .eq('business_id', businessId)
    .eq('status', 'active')) as unknown as {
    data:
      | Array<{
          id: string
          customer_id: string
          customers: { name: string | null } | { name: string | null }[] | null
        }>
      | null
  }

  if (!contracts || contracts.length === 0) return []

  const contractIds = contracts.map((c) => c.id)

  const [{ data: sentReports }, { data: doneVisits }] = await Promise.all([
    // 이미 거래처에 보낸 초도 리포트
    db
      .from('onboarding_reports')
      .select('contract_id')
      .eq('business_id', businessId)
      .in('contract_id', contractIds)
      .not('alimtalk_sent_at', 'is', null) as unknown as Promise<{
      data: { contract_id: string | null }[] | null
    }>,
    // 완료된 방문이 있는 계약
    db
      .from('bookings')
      .select('contract_id')
      .eq('business_id', businessId)
      .in('contract_id', contractIds)
      .eq('status', 'completed')
      .is('deleted_at', null) as unknown as Promise<{
      data: { contract_id: string | null }[] | null
    }>,
  ])

  const alreadySent = new Set((sentReports ?? []).map((r) => r.contract_id))
  const hasDoneVisit = new Set((doneVisits ?? []).map((b) => b.contract_id))

  return contracts
    .filter((c) => hasDoneVisit.has(c.id) && !alreadySent.has(c.id))
    .map((c) => {
      const cu = Array.isArray(c.customers) ? c.customers[0] : c.customers
      return { contractId: c.id, customerId: c.customer_id, customerName: cu?.name ?? '거래처' }
    })
}
