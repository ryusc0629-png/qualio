import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { chargeBillingKey } from './portone'
import { PLANS } from '@/lib/config/plans'
import { getChargeAmount } from './pricing'
import type { PlanId } from '@/lib/config/plans'

// 정기결제 자동청구 — 이용기간이 만료된 활성 구독을 저장된 빌키(billing_key)로 재청구한다.
//
// ⚠️ 아직 cron(daily-maintenance)에 연결하지 않았다.
//    실결제 테스트(카드등록 → 이 함수로 1회 청구 성공)까지 확인한 뒤에
//    daily-maintenance에서 `await chargeDueSubscriptions()` 한 줄로 연결할 것.
//    (검증 전 연결하면 미검증 상태로 실제 카드가 청구될 수 있음)
//
// ⚠️ 청구는 반드시 빌키를 발급한 곳과 같은 경로로 해야 한다.
//    우리 빌키는 포트원 카드등록창(portone-billing-return)에서 발급되므로 포트원 API로 청구한다.
//    예전엔 KCP 직접연동 함수(kcp-billing.chargeWithBillingKey)를 부르고 있었는데,
//    그건 KCP와 직접 계약해 발급한 빌키용이라 포트원 빌키로는 청구가 되지 않는다.
//
// Vercel Hobby는 cron 2개 제한이라 새 cron을 만들지 말고 daily-maintenance에 통합한다.

interface DueSubscription {
  id: string
  business_id: string
  plan: string
  next_plan: string | null
  billing_key: string | null
  current_period_end: string | null
}

export interface ChargeSummary {
  checked: number
  charged: number
  failed: number
}

export async function chargeDueSubscriptions(): Promise<ChargeSummary> {
  const db = createServiceClient()
  const now = new Date()

  // 만료 도래한 active 구독 (billing_key 보유분만) — 컬럼이 database.ts 타입 미반영 → 캐스팅
  const { data: subs } = await (db as unknown as SupabaseClient)
    .from('subscriptions')
    .select('id, business_id, plan, next_plan, billing_key, current_period_end')
    .eq('status', 'active')
    .not('billing_key', 'is', null)
    .lte('current_period_end', now.toISOString()) as unknown as { data: DueSubscription[] | null }

  const due = subs ?? []
  let charged = 0
  let failed = 0

  for (const sub of due) {
    if (!sub.billing_key) continue

    // 플랜 변경 예약(next_plan)은 '다음 결제부터 적용' — 자동청구가 바로 그 시점이다.
    // 청구 금액도 예약된 플랜 기준으로 뽑아야 돈과 부여 플랜이 어긋나지 않는다.
    const effectivePlan = (sub.next_plan ?? sub.plan) as PlanId
    if (!PLANS[effectivePlan]) {
      console.error('[Billing charge] 알 수 없는 플랜:', sub.business_id, effectivePlan)
      continue
    }

    // beta(무료) 등 유료 아님 → 스킵. 금액은 평생 할인까지 반영된 실제 청구액
    const { amount } = await getChargeAmount(sub.business_id, effectivePlan)
    if (!amount || amount <= 0) continue

    const planLabel = PLANS[effectivePlan]?.label ?? effectivePlan
    const ordrIdxx = `QR${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.toUpperCase()

    // 감사/멱등용 주문 기록
    await (db as unknown as SupabaseClient).from('kcp_payment_orders').insert({
      ordr_idxx: ordrIdxx,
      business_id: sub.business_id,
      plan_id: effectivePlan,
      amount,
      status: 'pending',
    })

    try {
      const r = await chargeBillingKey({
        paymentId: ordrIdxx,
        billingKey: sub.billing_key,
        planId: effectivePlan,
        amount,
        orderName: `퀄리오 ${planLabel} 플랜 정기결제`,
      })

      if (r.ok) {
        // 이용기간 1개월 연장 (직전 종료일 기준 — 하루 밀려도 누적 안 되게)
        const base = sub.current_period_end ? new Date(sub.current_period_end) : now
        const nextEnd = new Date(base)
        nextEnd.setMonth(nextEnd.getMonth() + 1)
        await db.from('subscriptions').update({
          plan: effectivePlan,   // 예약된 변경이 있었으면 이번 결제부터 적용
          next_plan: null,       // 반영했으니 예약 비움
          current_period_start: now.toISOString(),
          current_period_end: nextEnd.toISOString(),
          toss_payment_key: ordrIdxx,
        } as never).eq('id', sub.id)
        await (db as unknown as SupabaseClient).from('kcp_payment_orders')
          .update({ status: 'paid', paid_at: now.toISOString() })
          .eq('ordr_idxx', ordrIdxx)
        charged++
      } else {
        // 청구 실패 → past_due 로 표시(재시도·안내는 후속). 서비스 즉시 차단은 하지 않음.
        console.error('[Billing charge] 실패:', sub.business_id, r.error)
        await db.from('subscriptions').update({ status: 'past_due' } as never).eq('id', sub.id)
        await (db as unknown as SupabaseClient).from('kcp_payment_orders')
          .update({ status: 'failed' }).eq('ordr_idxx', ordrIdxx)
        failed++
      }
    } catch (e) {
      console.error('[Billing charge] 예외:', sub.business_id, e)
      await (db as unknown as SupabaseClient).from('kcp_payment_orders')
        .update({ status: 'failed' }).eq('ordr_idxx', ordrIdxx)
      failed++
    }
  }

  return { checked: due.length, charged, failed }
}
