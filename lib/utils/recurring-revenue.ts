import type { SupabaseClient } from '@supabase/supabase-js'
import { parseFrequency } from '@/lib/utils/frequency'

// 정기 계약 매출을 월 단위로 환산해 합산한다.
//
// ★거래처 Pro 요금(정기 매출의 1%)의 근거값이다. 원래 lib/admin/metrics.ts 안에
//   비공개 함수로 갇혀 있어 본사 지표에서만 쓸 수 있었다 — 요금 계산이 같은 값을
//   써야 하므로 공용으로 뺐다. 두 곳이 각자 계산하면 사장님 화면의 요금과
//   청구 금액이 어긋난다.

const WEEKS_PER_MONTH = 4.345

/**
 * 계약 1건의 월 환산 금액.
 * frequency는 JSON({type, count})이며 주 단위는 월 4.345회로 환산한다.
 * 레거시·불명 값은 contract_price를 월값으로 본다(보수적).
 */
export function monthlyContractValue(contractPrice: number, frequencyRaw: string | null): number {
  const f = frequencyRaw ? parseFrequency(frequencyRaw) : null
  if (!f) return contractPrice
  if (f.type === 'weekly') return Math.round(contractPrice * f.count * WEEKS_PER_MONTH)
  return contractPrice * f.count
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
