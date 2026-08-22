import type { SupabaseClient } from '@supabase/supabase-js'

// 정기 계약 매출을 월 단위로 환산해 합산한다.
//
// ★거래처 Pro 요금(정기 매출의 1%)의 근거값이다. 원래 lib/admin/metrics.ts 안에
//   비공개 함수로 갇혀 있어 본사 지표에서만 쓸 수 있었다 — 요금 계산이 같은 값을
//   써야 하므로 공용으로 뺐다. 두 곳이 각자 계산하면 사장님 화면의 요금과
//   청구 금액이 어긋난다.

/**
 * 계약 1건의 월 금액.
 *
 * ★contract_price는 **이미 월정액**이다 — 입력 폼 라벨이 "월 계약금액"이고,
 *   월간 청구서(lib/reports/monthly-charge.ts)·매출 집계(lib/utils/ltv.ts)·
 *   도급 정산(lib/finance/*)이 전부 이 값을 그대로 쓴다.
 *
 * ⛔frequency를 곱하지 말 것. "주 5일 들어가는 현장"은 방문 횟수를 뜻하지
 *   "주에 190만원"이 아니다. 2026-08-22까지 lib/admin/metrics.ts가 이걸 곱하고 있어
 *   본사 지표의 정기 매출이 **17배** 부풀어 있었다(실제 252만원 → 4,334만원).
 */
export function monthlyContractValue(contractPrice: number, _frequencyRaw?: string | null): number {
  return contractPrice
}

export interface ContractLike {
  contract_price: number | null
  frequency: string | null
  status: string | null
}

/** 살아 있는 계약만 — 끝났거나 취소된 건 요금 근거가 될 수 없다 */
const LIVE = new Set(['active', 'paused'])

/** 계약 목록의 월 정기 매출 합계 */
export function sumRecurringRevenue(contracts: ContractLike[]): number {
  return contracts
    .filter((c) => LIVE.has(c.status ?? ''))
    .reduce((sum, c) => sum + monthlyContractValue(c.contract_price ?? 0, c.frequency), 0)
}

/** 이 업체의 월 정기 계약 매출 — 거래처 Pro 요금 계산에 쓴다 */
export async function getRecurringRevenue(
  db: SupabaseClient,
  businessId: string,
): Promise<number> {
  const { data } = await db
    .from('contracts')
    .select('contract_price, frequency, status')
    .eq('business_id', businessId)

  return sumRecurringRevenue((data ?? []) as ContractLike[])
}
