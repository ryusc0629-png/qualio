'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import { assertAdmin } from '@/lib/admin/auth'
import { cancelPortOnePayment } from '@/lib/payments/portone'
import { revalidatePath } from 'next/cache'

// 본사에서 결제 건을 환불한다 — 포트원 취소 + 우리 DB 갱신을 한 번에.
//
// 왜 이 액션이 필요한가: 포트원 콘솔에서만 환불하면 kcp_payment_orders는 'paid'로 남아
// 본사 장부가 실제와 어긋난다. 나중에 매출을 세면 환불한 돈까지 매출로 잡힌다.
//
// ⚠️ 금액은 화면에서 계산해 넘어온 값을 그대로 믿지 않고 상한만 검증한다
//    (결제액보다 큰 환불은 거부). 산정 규칙 자체는 lib/payments/refund-calc.ts 하나에 있다.

const schema = z.object({
  ordrIdxx: z.string().min(1),
  /** 환불 금액(원). 결제액과 같으면 전액 취소로 보낸다 */
  amount: z.number().int().positive(),
  reason: z.string().min(1).max(200),
  /** 환불과 함께 구독을 해지할지 — 일할 환불은 보통 해지가 함께 간다 */
  cancelSubscription: z.boolean(),
})

export const refundPaymentAction = action
  .schema(schema)
  .action(async ({ parsedInput }) => {
    await assertAdmin()

    const looseDb = createServiceClient() as unknown as SupabaseClient

    // 주문을 먼저 확인 — 이미 환불했거나 결제되지 않은 건을 다시 취소하지 않는다
    const { data: order } = (await looseDb
      .from('kcp_payment_orders')
      .select('ordr_idxx, business_id, amount, status')
      .eq('ordr_idxx', parsedInput.ordrIdxx)
      .maybeSingle()) as unknown as {
        data: { ordr_idxx: string; business_id: string; amount: number; status: string } | null
      }

    if (!order) throw new Error('[APP] 결제 건을 찾을 수 없어요')
    if (order.status !== 'paid') throw new Error('[APP] 이미 환불했거나 결제되지 않은 건이에요')
    if (parsedInput.amount > order.amount) {
      throw new Error('[APP] 결제 금액보다 많이 환불할 수 없어요')
    }

    const isFull = parsedInput.amount === order.amount
    const result = await cancelPortOnePayment({
      paymentId: order.ordr_idxx,
      // 전액이면 amount를 빼서 보낸다 — 포트원은 금액 없는 요청을 전액 취소로 처리한다
      amount: isFull ? undefined : parsedInput.amount,
      reason: parsedInput.reason,
    })

    if (!result.ok) {
      console.error('[AdminRefund] 포트원 취소 실패:', order.ordr_idxx, result.error)
      throw new Error(`[APP] 환불하지 못했어요: ${result.error ?? '포트원 오류'}`)
    }

    // 포트원에서 환불됐으니 우리 기록도 반드시 맞춘다.
    // (여기서 실패해도 돈은 이미 나갔으므로, 조용히 넘기지 말고 로그로 남긴다)
    const { error: orderError } = await looseDb
      .from('kcp_payment_orders')
      .update({ status: isFull ? 'refunded' : 'partially_refunded' })
      .eq('ordr_idxx', order.ordr_idxx)

    if (orderError) {
      console.error('[AdminRefund] ★환불은 됐는데 주문 상태 갱신 실패 — 손으로 맞출 것:', order.ordr_idxx, orderError)
    }

    if (parsedInput.cancelSubscription) {
      const { error: subError } = await looseDb
        .from('subscriptions')
        .update({ status: 'cancelled', next_plan: null })
        .eq('business_id', order.business_id)
      if (subError) {
        console.error('[AdminRefund] 구독 해지 실패:', order.business_id, subError)
      }
    }

    revalidatePath('/admin/refunds')
    return { success: true, refunded: result.cancelledAmount ?? parsedInput.amount }
  })
