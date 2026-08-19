import { createServiceClient } from '@/lib/supabase/server'
import { getPlanPrice, vatOf, type PlanId } from '@/lib/config/plans'
import { applyLifetimeDiscount, BETA_SEATS } from '@/lib/config/beta'

export interface ChargeAmount {
  /** 정가 공급가액 (요금제 표에 적힌 금액 — 부가세 별도) */
  listPrice: number
  /** 할인까지 반영한 공급가액 (부가세 별도) */
  supplyAmount: number
  /** 부가세 (공급가액의 10%) */
  vat: number
  /** 실제로 카드에 청구할 금액 = 공급가액 + 부가세 */
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
 *
 * ★부가세: 요금표의 금액은 전부 공급가액(부가세 별도)이다. 청구는 여기에 10%를 더한 총액.
 *   순서가 중요하다 — **할인을 공급가액에 먼저 적용하고, 그 결과에 부가세를 얹는다.**
 *   (부가세를 먼저 더하고 할인하면 세액이 어긋나 세금계산서와 맞지 않는다)
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
  // 1) 할인은 공급가액에 먼저 2) 그 위에 부가세
  const supplyAmount = applyLifetimeDiscount(listPrice, discountRate)
  const vat = vatOf(supplyAmount)

  return {
    listPrice,
    supplyAmount,
    vat,
    amount: supplyAmount + vat,
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
