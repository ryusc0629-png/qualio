import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { chargeBillingKey } from './portone'
import { PLANS } from '@/lib/config/plans'
import { getChargeAmount } from './pricing'
import { notifyChargeFailed } from './charge-failed-notify'
import type { PlanId } from '@/lib/config/plans'

// 정기결제 자동청구 — 이용기간이 만료된 활성 구독을 저장된 빌키(billing_key)로 재청구한다.
//
// 2026-08-19 cron 연결 완료 — `app/api/cron/charge-subscriptions`가 이 함수를 부르고,
// 그 라우트는 daily-maintenance의 하위 작업 목록에 들어 있다.
// (실결제 검증: 심사용 테스트 계정으로 카드등록→첫 달 49,000원 승인→빌키 저장까지 확인)
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

    // ★중복 청구 방지 — 주문번호를 (구독 × 이용기간)으로 고정해 PK로 선점한다.
    //   daily-maintenance는 하위 작업을 병렬로 돌리고, 크론은 재시도·수동 호출로 겹칠 수 있다.
    //   난수 주문번호를 쓰면 같은 달 요금이 두 번 승인돼도 DB가 막아주지 못한다(실제 돈이 두 번 빠진다).
    //   같은 기간 건은 두 번째 insert가 PK 충돌로 실패 → 그 구독은 건너뛴다.
    //   ⛔난수(Date.now+randomBytes)로 되돌리지 말 것.
    const periodKey = (sub.current_period_end ?? now.toISOString()).slice(0, 10).replace(/-/g, '')
    const ordrIdxx = `QR${sub.id.replace(/-/g, '').slice(0, 18)}${periodKey}`.toUpperCase()

    // 감사·멱등용 주문 기록 — 청구 '전에' 선점해야 의미가 있다
    const { error: claimError } = await (db as unknown as SupabaseClient)
      .from('kcp_payment_orders')
      .insert({
        ordr_idxx: ordrIdxx,
        business_id: sub.business_id,
        plan_id: effectivePlan,
        amount,
        status: 'pending',
      })
    if (claimError) {
      // 이미 같은 기간으로 청구가 걸려 있음(동시 실행·재시도) → 건너뛴다
      console.error('[Billing charge] 이미 처리 중인 청구라 건너뜀:', sub.business_id, ordrIdxx)
      continue
    }

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
        // 청구 실패 → past_due 로 표시. 서비스 즉시 차단은 하지 않고 7일 유예를 준다.
        console.error('[Billing charge] 실패:', sub.business_id, r.error)
        await db.from('subscriptions').update({ status: 'past_due' } as never).eq('id', sub.id)
        await (db as unknown as SupabaseClient).from('kcp_payment_orders')
          .update({ status: 'failed' }).eq('ordr_idxx', ordrIdxx)
        // ★사장님에게 알린다 — 이게 없으면 7일 뒤 "갑자기 잠겼다"는 CS가 된다.
        //   알림이 실패해도 청구 루프는 계속돼야 하므로 여기서 삼킨다.
        await notifyChargeFailed({ businessId: sub.business_id, planLabel, amount })
          .catch((e) => console.error('[Billing charge] 실패 알림 오류:', sub.business_id, e))
        failed++
      }
    } catch (e) {
      // 예외(네트워크 오류·타임아웃 등)도 실패와 똑같이 처리한다 — past_due + 사장님 알림.
      //
      // ⚠️ 여기서 주문 기록(선점)을 지워 '내일 자동 재시도'하게 만들고 싶어질 텐데, 하지 말 것.
      //    포트원이 승인을 마친 뒤 응답을 받는 도중에 끊겨도 이 catch로 온다. 그 상태에서
      //    선점을 풀면 다음 실행이 같은 달 요금을 또 승인한다. 돈이 두 번 빠지는 것보다
      //    한 번 덜 걷히는 편이 낫다 — 사장님이 알림을 받고 카드를 다시 등록하면 복구된다.
      console.error('[Billing charge] 예외:', sub.business_id, e)
      await db.from('subscriptions').update({ status: 'past_due' } as never).eq('id', sub.id)
      await (db as unknown as SupabaseClient).from('kcp_payment_orders')
        .update({ status: 'failed' }).eq('ordr_idxx', ordrIdxx)
      await notifyChargeFailed({ businessId: sub.business_id, planLabel, amount })
        .catch((err) => console.error('[Billing charge] 실패 알림 오류:', sub.business_id, err))
      failed++
    }
  }

  return { checked: due.length, charged, failed }
}
