import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { chargeWithBillingKey } from './kcp-billing'
import { getPlanPrice, PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

// 정기결제 자동청구 — 이용기간이 만료된 활성 구독을 저장된 빌키(billing_key)로 재청구한다.
//
// ⚠️ 아직 cron(daily-maintenance)에 연결하지 않았다.
//    KCP 정기결제 개통 + 실결제 테스트(빌키발급→이 함수로 1회 청구 성공)까지 검증한 뒤에
//    daily-maintenance에서 `await chargeDueSubscriptions()` 한 줄로 연결할 것.
//    (검증 전 연결하면 미검증 상태로 실제 카드가 청구될 수 있음)
//
// Vercel Hobby는 cron 2개 제한이라 새 cron을 만들지 말고 daily-maintenance에 통합한다.

interface DueSubscription {
  id: string
  business_id: string
  plan: string
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
    .select('id, business_id, plan, billing_key, current_period_end')
    .eq('status', 'active')
    .not('billing_key', 'is', null)
    .lte('current_period_end', now.toISOString()) as unknown as { data: DueSubscription[] | null }

  const due = subs ?? []
  let charged = 0
  let failed = 0

  for (const sub of due) {
    if (!sub.billing_key) continue
    // beta(무료) 등 유료 아님 → 스킵
    const amount = getPlanPrice(sub.plan as PlanId)
    if (!amount || amount <= 0) continue

    const planLabel = PLANS[sub.plan as PlanId]?.label ?? sub.plan
    const ordrIdxx = `QR${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.toUpperCase()

    // 감사/멱등용 주문 기록
    await (db as unknown as SupabaseClient).from('kcp_payment_orders').insert({
      ordr_idxx: ordrIdxx,
      business_id: sub.business_id,
      plan_id: sub.plan,
      amount,
      status: 'pending',
    })

    try {
      const r = await chargeWithBillingKey({
        batchKey: sub.billing_key,
        ordrIdxx,
        goodMny: amount,
        goodName: `퀄리오 ${planLabel} 플랜 정기결제`,
      })

      if (r.ok) {
        // 이용기간 1개월 연장 (직전 종료일 기준 — 하루 밀려도 누적 안 되게)
        const base = sub.current_period_end ? new Date(sub.current_period_end) : now
        const nextEnd = new Date(base)
        nextEnd.setMonth(nextEnd.getMonth() + 1)
        await db.from('subscriptions').update({
          current_period_start: now.toISOString(),
          current_period_end: nextEnd.toISOString(),
          toss_payment_key: r.tno ?? ordrIdxx,
        } as never).eq('id', sub.id)
        await (db as unknown as SupabaseClient).from('kcp_payment_orders')
          .update({ status: 'paid', kcp_tno: r.tno ?? null, paid_at: now.toISOString() })
          .eq('ordr_idxx', ordrIdxx)
        charged++
      } else {
        // 청구 실패 → past_due 로 표시(재시도·안내는 후속). 서비스 즉시 차단은 하지 않음.
        console.error('[KCP billing charge] 실패:', sub.business_id, r.resCd, r.resMsg)
        await db.from('subscriptions').update({ status: 'past_due' } as never).eq('id', sub.id)
        await (db as unknown as SupabaseClient).from('kcp_payment_orders')
          .update({ status: 'failed' }).eq('ordr_idxx', ordrIdxx)
        failed++
      }
    } catch (e) {
      console.error('[KCP billing charge] 예외:', sub.business_id, e)
      await (db as unknown as SupabaseClient).from('kcp_payment_orders')
        .update({ status: 'failed' }).eq('ordr_idxx', ordrIdxx)
      failed++
    }
  }

  return { checked: due.length, charged, failed }
}
