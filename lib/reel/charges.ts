import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { REEL_FREE_QUOTA, reelPriceFor } from './pricing'
import { getAdminBusinessIds } from '@/lib/admin/auth'

export { REEL_FREE_QUOTA, REEL_UNIT_PRICE, reelPriceFor } from './pricing'

// 홍보 영상 건별 요금.
//
// 계정당 무료 5건을 주고 그 뒤부터 건당 과금한다. 결제창을 또 띄우지 않고
// 다음 달 정기결제 금액에 얹는다 — 사장님이 결제를 두 번 하게 만들지 않는다.
//
// ⚠️금액은 전부 **공급가액(부가세 별도)**이다. 부가세는 청구 직전에 한 번만 얹는다
//    (요금제와 같은 규칙 — 할인·집계는 공급가액으로, 부가세는 마지막에).

export interface ReelUsage {
  /** 지금까지 완성된 편수 (무료분 포함) */
  made: number
  /** 남은 무료 편수 */
  freeLeft: number
  /** 아직 청구 안 된 건수 */
  pendingCount: number
  /** 아직 청구 안 된 금액 (공급가액) */
  pendingAmount: number
}

/**
 * 본사(퀄리오) 계정인지 — 여기는 요금을 물리지 않는다.
 *
 * 다트클린은 우리가 직접 운영하는 계정이라 문구·화질·톤을 바꿔가며 계속 만들어봐야 한다.
 * 무료 5편에 걸리면 그때마다 우리 돈이 우리한테 청구되는 꼴이라 의미가 없다.
 */
async function isInternalBusiness(businessId: string): Promise<boolean> {
  try {
    return (await getAdminBusinessIds()).includes(businessId)
  } catch (err) {
    // 판정에 실패하면 '고객사'로 본다 — 잘못해서 과금을 빠뜨리는 쪽보다 낫다
    console.error('[Reel] 본사 계정 판정 실패:', err)
    return false
  }
}

/** 이 업체의 홍보 영상 사용 현황 */
export async function getReelUsage(db: SupabaseClient, businessId: string): Promise<ReelUsage> {
  const { data } = (await db
    .from('reel_charges')
    .select('amount, billed_at')
    .eq('business_id', businessId)) as { data: { amount: number; billed_at: string | null }[] | null }

  const rows = data ?? []
  const unbilled = rows.filter((r) => r.billed_at === null && r.amount > 0)
  // 본사 계정은 무료 편수를 무제한으로 보여준다(실제로도 안 물린다)
  const internal = await isInternalBusiness(businessId)

  return {
    made: rows.length,
    freeLeft: internal ? Number.POSITIVE_INFINITY : Math.max(0, REEL_FREE_QUOTA - rows.length),
    pendingCount: unbilled.length,
    pendingAmount: unbilled.reduce((s, r) => s + r.amount, 0),
  }
}

/**
 * 완성된 영상 한 편을 기록한다. 무료분이 남았으면 0원, 아니면 정가.
 *
 * ★완성됐을 때만 부른다 — 실패한 건에 돈을 물리면 안 된다.
 * ★보고서당 한 번만 기록된다(unique). 다시 만들어도 두 번 물리지 않는다.
 *
 * 실패해도 영상은 이미 만들어졌으므로 부르는 쪽을 막지 않는다.
 */
export async function recordReelCharge(
  db: SupabaseClient,
  businessId: string,
  reportId: string,
): Promise<void> {
  try {
    const { count } = await db
      .from('reel_charges')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)

    // 본사 계정은 언제나 0원 — 우리 돈이 우리한테 청구되는 걸 막는다
    const amount = (await isInternalBusiness(businessId)) ? 0 : reelPriceFor(count ?? 0)

    const { error } = await db
      .from('reel_charges')
      .insert({ business_id: businessId, report_id: reportId, amount })

    // 같은 보고서로 이미 기록돼 있으면(다시 만들기) 조용히 넘어간다 — 두 번 물리지 않는다
    if (error && !error.message?.includes('duplicate')) {
      console.error('[Reel] 이용 기록 실패:', error)
    }
  } catch (err) {
    console.error('[Reel] 이용 기록 중 오류:', err)
  }
}

/**
 * 이번 청구에 얹을 홍보 영상 금액 (공급가액).
 *
 * ⚠️정기결제에서만 부른다. 신규 가입 결제창에서 부르면 안 된다 —
 *   거기서는 요금제 금액만 확인하고, 사용료는 다음 달 정기결제부터 붙는다.
 */
export async function getPendingReelAmount(
  db: SupabaseClient,
  businessId: string,
): Promise<{ amount: number; ids: string[] }> {
  const { data } = (await db
    .from('reel_charges')
    .select('id, amount')
    .eq('business_id', businessId)
    .is('billed_at', null)
    .gt('amount', 0)) as { data: { id: string; amount: number }[] | null }

  const rows = data ?? []
  return {
    amount: rows.reduce((s, r) => s + r.amount, 0),
    ids: rows.map((r) => r.id),
  }
}

/**
 * 청구가 끝난 건들을 '받은 돈'으로 표시한다.
 *
 * ★결제가 **성공한 뒤에만** 부른다. 먼저 표시했다가 결제가 실패하면 그 돈은 영영 못 받는다.
 */
export async function markReelChargesBilled(
  db: SupabaseClient,
  ids: string[],
  orderId: string,
): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db
    .from('reel_charges')
    .update({ billed_at: new Date().toISOString(), billed_order_id: orderId })
    .in('id', ids)

  // 여기서 실패하면 다음 달에 또 청구된다 — 반드시 로그를 남겨 사람이 볼 수 있게 한다
  if (error) console.error('[Reel] 청구 완료 표시 실패 — 다음 달 중복 청구 위험:', orderId, error)
}
