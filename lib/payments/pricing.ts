import { createServiceClient } from '@/lib/supabase/server'
import { getPlanPrice, type PlanId } from '@/lib/config/plans'
import { applyLifetimeDiscount, BETA_SEATS } from '@/lib/config/beta'

export interface ChargeAmount {
  /** 정가 (요금제 표에 적힌 금액) */
  listPrice: number
  /** 실제로 청구할 금액 (평생 할인 적용) */
  amount: number
  /** 이 업체에 붙은 평생 할인율 (%) — 0이면 할인 없음 */
  discountRate: number
  /** 베타 순번 (없으면 null) */
  betaNumber: number | null
}

/**
 * 이 업체가 이 플랜을 결제할 때 실제로 청구할 금액.
 *
 * 결제를 시작하는 쪽(주문 생성)과 검증하는 쪽(결제 후 금액 대조)이 **반드시 같은 함수**를 써야 한다.
 * 한쪽만 할인을 적용하면 "결제 금액이 올바르지 않습니다"로 정상 결제가 튕긴다.
 */
export async function getChargeAmount(businessId: string, planId: PlanId): Promise<ChargeAmount> {
  const listPrice = getPlanPrice(planId)

  const db = createServiceClient()
  const { data } = (await db
    .from('businesses')
    .select('beta_number, lifetime_discount_rate' as never)
    .eq('id', businessId)
    .maybeSingle()) as unknown as {
      data: { beta_number: number | null; lifetime_discount_rate: number | null } | null
    }

  const discountRate = data?.lifetime_discount_rate ?? 0
  return {
    listPrice,
    amount: applyLifetimeDiscount(listPrice, discountRate),
    discountRate,
    betaNumber: data?.beta_number ?? null,
  }
}

/** 남은 베타 자리 — 광고·요금제 화면에 "N자리 남음"으로 쓴다 */
export async function getRemainingBetaSeats(): Promise<number> {
  const db = createServiceClient()
  const { count } = await db
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .not('beta_number', 'is', null)

  return Math.max(0, BETA_SEATS - (count ?? 0))
}
