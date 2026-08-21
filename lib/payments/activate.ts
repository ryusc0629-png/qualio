import type { SupabaseClient } from '@supabase/supabase-js'
import { getAutoPostLimit, type PlanId } from '@/lib/config/plans'

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

  await enableAutoPost(db, businessId, planId)
}

/**
 * 결제가 끝나면 자동 글쓰기를 켠다.
 *
 * 왜 여기인가: 예전엔 **마케팅 화면에 들어가야** 켜졌다(post-list.tsx가 열릴 때 목표를 설정).
 * 그래서 그 메뉴를 한 번도 안 눌러본 업체는 영영 안 켜졌고, 실제로 32곳 중 13곳이 그 상태였다.
 * 글이 없으니 홈페이지도 비고 AI 검색에도 안 잡혀서, 결국 "퀄리오 써도 별거 없네"가 된다.
 *
 * 결제는 모든 고객이 반드시 거치는 지점이고, 자동 글쓰기는 그 요금에 포함된 기능이다.
 * 그러니 돈을 받은 시점에 켜주는 게 맞다 — 사장님이 메뉴를 찾아 들어갈 이유가 없어야 한다.
 *
 * ⚠️이미 켜져 있으면 건드리지 않는다. 플랜을 올렸으면 새 한도로 올려준다(내리지는 않는다 —
 *   이번 달에 이미 그만큼 쓸 계획이었을 수 있다. 다음 달 자동청구에서 자연스럽게 맞춰진다).
 */
export async function enableAutoPost(db: SupabaseClient, businessId: string, planId: PlanId): Promise<void> {
  try {
    const limit = getAutoPostLimit(planId)
    if (limit <= 0) return

    const { data: biz } = (await db
      .from('businesses')
      .select('monthly_post_target')
      .eq('id', businessId)
      .maybeSingle()) as { data: { monthly_post_target: number | null } | null }

    const current = biz?.monthly_post_target ?? 0
    if (current >= limit) return

    await db
      .from('businesses')
      .update({ monthly_post_target: limit } as never)
      .eq('id', businessId)
  } catch (err) {
    // 여기서 실패해도 결제는 이미 끝났다 — 구독 활성화를 막으면 안 된다.
    // 못 켜졌으면 마케팅 화면에 들어갈 때 예전 경로로 켜진다.
    console.error('[Activate] 자동 글쓰기 켜기 실패:', businessId, err)
  }
}
