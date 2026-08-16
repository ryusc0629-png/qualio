import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlanId } from '@/lib/config/plans'

// 결제 성공 후 구독을 활성화(1개월/30일)한다. 포트원·토스 공용.
//
// ⚠️ 방금 결제한 플랜(planId)을 그대로 부여한다. 예약(next_plan)을 우선 적용하면
//    "확장 요금을 냈는데 시작 플랜이 부여되는" 돈≠플랜 불일치가 생긴다.
//    예약은 사용자가 결제창에서 플랜을 다시 고른 시점에 무효가 되므로 여기서 비운다.
//    '다음 결제부터 적용'되는 예약은 자동청구(lib/payments/billing-charge.ts)에서 반영한다.
//
// ref.orderId  — 우리가 만든 주문 식별자
// ref.paymentKey — PG가 발급한 결제 키(포트원 paymentId / 토스 paymentKey)
// ref.billingKey — 정기결제 빌링키(있으면 저장 → 매월 자동청구에 사용)
// (subscriptions의 toss_* 컬럼은 레거시 이름이라 PG 무관하게 재사용한다.)
export async function activateSubscription(
  db: SupabaseClient,
  businessId: string,
  planId: PlanId,
  ref: { orderId: string; paymentKey: string; billingKey?: string }
): Promise<void> {
  const now = new Date()
  const nextMonth = new Date(now)
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  const { data: existing } = (await db
    .from('subscriptions')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle()) as unknown as {
    data: { id: string } | null
  }

  const fields: Record<string, unknown> = {
    plan: planId,
    status: 'active',
    payment_id: ref.orderId,
    toss_order_id: ref.orderId,
    toss_payment_key: ref.paymentKey,
    current_period_start: now.toISOString(),
    current_period_end: nextMonth.toISOString(),
    next_plan: null, // 방금 플랜을 직접 골라 결제했으므로 이전 변경 예약은 무효
  }
  // 정기결제 빌링키가 있으면 저장 (매월 자동청구에 사용)
  if (ref.billingKey) fields.billing_key = ref.billingKey

  if (existing) {
    await db
      .from('subscriptions')
      .update(fields as never)
      .eq('id', existing.id)
  } else {
    await db.from('subscriptions').insert({ business_id: businessId, ...fields } as never)
  }
}
