import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlanId } from '@/lib/config/plans'

// 결제 성공 후 구독을 활성화(1개월/30일)한다. 포트원·토스 공용.
// next_plan 예약(플랜 변경 예약)이 있으면 그 플랜을 우선 적용한다.
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
    .select('id, next_plan' as never)
    .eq('business_id', businessId)
    .maybeSingle()) as unknown as {
    data: { id: string; next_plan: string | null } | null
  }

  // 예약된 변경이 있으면 그 플랜, 없으면 결제한 플랜을 적용
  const effectivePlan = existing?.next_plan ?? planId

  const fields: Record<string, unknown> = {
    plan: effectivePlan,
    status: 'active',
    payment_id: ref.orderId,
    toss_order_id: ref.orderId,
    toss_payment_key: ref.paymentKey,
    current_period_start: now.toISOString(),
    current_period_end: nextMonth.toISOString(),
    next_plan: null, // 예약 초기화
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
