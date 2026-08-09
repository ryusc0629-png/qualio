import type { SupabaseClient } from '@supabase/supabase-js'

// 성과판·업셀 노출 기준 — 이번 달 '만든 매출'이 이 금액을 넘는 사장님에게만 보여준다.
// 데이터가 0이거나 소규모면 오히려 퀄리오가 불리하게 보이므로, 자랑할 만할 때만 노출한다.
// (하나의 상수로 관리 — 기준 조정은 여기만 바꾸면 됨)
export const IMPACT_MIN_REVENUE = 5_000_000

export interface QualioImpact {
  completedCount: number // 이번 달 완료한 예약 수
  completedRevenue: number // 완료 매출 합(원) = 퀄리오가 만든 매출
  upcomingCount: number // 아직 진행 중(확정·진행)인 예약 수
  upcomingRevenue: number // 예정 매출 합(원) — 곧 들어올 돈
}

// '퀄리오가 만든 매출' = 퀄리오로 완료된 모든 예약의 매출.
// 외부에서 들어온 유입이라도 견적서·시방서 등 퀄리오의 전문성으로 계약이 성사되므로,
// 퀄리오를 통해 이뤄진 매출은 모두 퀄리오의 성과로 집계한다.
// (테스트 견적으로 만든 예약만 제외 — 대표 본인 테스트 오염 방지)
export async function getQualioImpact(
  db: SupabaseClient,
  businessId: string,
  monthStartIso: string,
  monthEndIso: string,
): Promise<QualioImpact> {
  const { data: rows } = (await db
    .from('bookings')
    .select('final_price, status, quote_id, scheduled_at')
    .eq('business_id', businessId)
    .gte('scheduled_at', monthStartIso)
    .lte('scheduled_at', monthEndIso)) as unknown as {
    data: { final_price: number | null; status: string; quote_id: string | null; scheduled_at: string }[] | null
  }
  const list = rows ?? []
  if (list.length === 0) {
    return { completedCount: 0, completedRevenue: 0, upcomingCount: 0, upcomingRevenue: 0 }
  }

  // 테스트 견적으로 생성된 예약만 걸러낸다
  const quoteIds = [...new Set(list.map((r) => r.quote_id).filter((v): v is string => !!v))]
  let testIds = new Set<string>()
  if (quoteIds.length > 0) {
    const { data: qs } = (await db
      .from('quotes')
      .select('id, is_test')
      .in('id', quoteIds)) as unknown as { data: { id: string; is_test: boolean | null }[] | null }
    testIds = new Set((qs ?? []).filter((q) => q.is_test).map((q) => q.id))
  }
  const real = list.filter((r) => !(r.quote_id && testIds.has(r.quote_id)))

  let completedCount = 0
  let completedRevenue = 0
  let upcomingCount = 0
  let upcomingRevenue = 0
  for (const r of real) {
    const price = Math.round(r.final_price ?? 0)
    if (r.status === 'completed') {
      completedCount += 1
      completedRevenue += price
    } else if (r.status === 'confirmed' || r.status === 'in_progress') {
      upcomingCount += 1
      upcomingRevenue += price
    }
  }
  return { completedCount, completedRevenue, upcomingCount, upcomingRevenue }
}
