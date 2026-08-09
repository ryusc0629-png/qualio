import type { SupabaseClient } from '@supabase/supabase-js'

export interface QualioImpact {
  completedCount: number // 이번 달 퀄리오로 들어와 '완료'된 예약 수
  completedRevenue: number // 그 예약들의 매출 합(원)
  upcomingCount: number // 퀄리오로 들어왔고 아직 완료 전(확정·진행 중) 예약 수
}

// '퀄리오가 데려온' 예약 = 퀄리오 견적 페이지를 거쳐 들어온 예약(quote_id 있음).
// 사장님이 전화로 직접 입력한 오프라인 예약(quote_id 없음)은 제외 → 정직한 귀속(숫자를 부풀리지 않음).
// 테스트 견적(대표 자기 번호 등)도 제외.
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
    .not('quote_id', 'is', null)
    .gte('scheduled_at', monthStartIso)
    .lte('scheduled_at', monthEndIso)) as unknown as {
    data: { final_price: number | null; status: string; quote_id: string | null; scheduled_at: string }[] | null
  }
  const list = rows ?? []
  if (list.length === 0) return { completedCount: 0, completedRevenue: 0, upcomingCount: 0 }

  // 테스트 견적 제외
  const quoteIds = [...new Set(list.map((r) => r.quote_id).filter((v): v is string => !!v))]
  let testIds = new Set<string>()
  if (quoteIds.length > 0) {
    const { data: qs } = (await db
      .from('quotes')
      .select('id, is_test')
      .in('id', quoteIds)) as unknown as { data: { id: string; is_test: boolean | null }[] | null }
    testIds = new Set((qs ?? []).filter((q) => q.is_test).map((q) => q.id))
  }
  const real = list.filter((r) => r.quote_id && !testIds.has(r.quote_id))

  let completedCount = 0
  let completedRevenue = 0
  let upcomingCount = 0
  for (const r of real) {
    if (r.status === 'completed') {
      completedCount += 1
      completedRevenue += Math.round(r.final_price ?? 0)
    } else if (r.status === 'confirmed' || r.status === 'in_progress') {
      upcomingCount += 1
    }
  }
  return { completedCount, completedRevenue, upcomingCount }
}
