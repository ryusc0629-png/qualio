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
 * 자동 글쓰기를 켠다. **세팅이 끝난 업체만.**
 *
 * 왜 자동으로 켜나: 예전엔 마케팅 화면에 들어가야 켜졌다(post-list.tsx가 열릴 때 목표를 설정).
 * 그래서 그 메뉴를 한 번도 안 눌러본 업체는 영영 안 켜졌고, 실제로 32곳 중 13곳이 그 상태였다.
 * 글이 없으니 홈페이지도 비고 AI 검색에도 안 잡혀 "퀄리오 써도 별거 없네"가 된다.
 *
 * ⚠️왜 '세팅된 업체만'인가: 글을 쓰려면 재료가 있어야 한다.
 *   서비스 항목이 하나도 없으면 무슨 청소를 하는 업체인지조차 몰라서 글이 뻔한 소리가 되고,
 *   그런 글은 검색에도 안 잡히면서 토큰만 나간다. 가입만 해두고 아무것도 안 한 계정이
 *   대부분 이 상태다 — 거기에 매달 24편씩 쓰는 건 돈만 태우는 일이다.
 *
 * ⛔조건을 '결제했으면 무조건'으로 되돌리지 말 것.
 */
export async function enableAutoPost(
  db: SupabaseClient,
  businessId: string,
  planId: PlanId,
): Promise<void> {
  try {
    const limit = getAutoPostLimit(planId)
    if (limit <= 0) return

    const [{ data: biz }, { count: serviceCount }] = await Promise.all([
      db
        .from('businesses')
        .select('monthly_post_target')
        .eq('id', businessId)
        .maybeSingle() as unknown as Promise<{ data: { monthly_post_target: number | null } | null }>,
      db
        .from('service_items')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('is_active', true)
        .is('deleted_at', null),
    ])

    // 이미 켜져 있으면 건드리지 않는다 (플랜을 올렸으면 새 한도로 올린다 — 내리지는 않는다)
    const current = biz?.monthly_post_target ?? 0
    if (current >= limit) return

    // 쓸 재료가 없으면 켜지 않는다. 서비스를 등록하는 시점에 다시 불린다.
    if ((serviceCount ?? 0) === 0) return

    await db
      .from('businesses')
      .update({ monthly_post_target: limit } as never)
      .eq('id', businessId)
  } catch (err) {
    // 여기서 실패해도 결제는 이미 끝났다 — 구독 활성화를 막으면 안 된다.
    console.error('[Activate] 자동 글쓰기 켜기 실패:', businessId, err)
  }
}
