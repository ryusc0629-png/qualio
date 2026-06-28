import { createServiceClient } from '@/lib/supabase/server'

type DbClient = ReturnType<typeof createServiceClient>

export interface BundleReviewResult {
  needsReview: boolean
  // 검토가 필요한 이유 (사장님에게 보여줄 안내 문구)
  reason: string | null
  // 변동형으로 판단된 서비스 이름들 (배지/안내에 활용)
  serviceNames: string[]
}

// 변동형 서비스 판별: 에어컨 유형별 단가(ac_type_prices)나 항목별 단가(unit_prices)가 있으면
// 견적 시점에 대수/형태/개수가 정해지지 않아 금액이 달라질 수 있다.
function isVariableService(svc: { ac_type_prices: unknown; unit_prices: unknown }): boolean {
  const ac = svc.ac_type_prices
  const hasAc =
    ac != null && typeof ac === 'object' && !Array.isArray(ac) && Object.keys(ac as object).length > 0
  const unit = svc.unit_prices
  const hasUnit = Array.isArray(unit) && unit.length > 0
  return hasAc || hasUnit
}

// 선택한 번들(tier)에 변동형 서비스가 포함됐는지 검사한다.
// 포함되면 '검토 필요' — 사장님이 통화로 대수/형태를 확인한 뒤 금액을 조정하도록 유도한다.
// 견적의 주(主) 서비스는 고객이 견적 단계에서 이미 수량을 골랐으므로 여기서 보지 않고,
// 번들에 끼워진 다른 변동형 서비스(금액이 base_price로만 잡혀 미확정인 항목)만 본다.
export async function detectBundleReview(
  db: DbClient,
  businessId: string,
  selectedTier: string,
): Promise<BundleReviewResult> {
  const none: BundleReviewResult = { needsReview: false, reason: null, serviceNames: [] }

  // 1. 업체의 해당 tier 찾기
  const { data: tier } = await db
    .from('quote_tiers')
    .select('id')
    .eq('business_id', businessId)
    .eq('tier', selectedTier)
    .maybeSingle()
  if (!tier?.id) return none

  // 2. 번들에 묶인 서비스 ID 목록
  const { data: rows } = await db
    .from('quote_tier_services')
    .select('service_id')
    .eq('tier_id', tier.id)
  const serviceIds = (rows ?? []).map((r) => r.service_id)
  if (serviceIds.length === 0) return none

  // 3. 번들 서비스 중 변동형만 추려내기
  const { data: services } = await db
    .from('service_items')
    .select('name, ac_type_prices, unit_prices')
    .in('id', serviceIds)

  const variable = (services ?? []).filter(isVariableService)
  if (variable.length === 0) return none

  const serviceNames = variable.map((s) => s.name)
  return {
    needsReview: true,
    serviceNames,
    reason: `수량·형태에 따라 금액이 달라지는 항목이 포함돼 있어요 (${serviceNames.join(
      ', ',
    )}). 고객과 통화로 확인한 뒤 금액을 맞춰주세요.`,
  }
}
