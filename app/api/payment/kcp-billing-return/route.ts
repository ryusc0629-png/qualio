import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { approveBillingKeyIssue } from '@/lib/payments/kcp-billing'

// KCP 정기결제(빌키) 등록 결과 수신(POST 폼) → 빌키발급 승인 → billing_key 저장 + 구독 활성화(첫 달)
// 일반결제(kcp-return)와 동일 구조. 차이: 승인이 batch_key(빌키)를 반환하며 이를 저장한다.
// ⚠️ KCP 정기결제 개통 후에만 실제 동작.
export async function POST(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('host') ?? ''
  const origin = `${proto}://${host}`
  const redirectTo = (params: string) =>
    NextResponse.redirect(`${origin}/upgrade/success?${params}`, 303)
  const fail = (msg: string) => redirectTo(`status=fail&message=${encodeURIComponent(msg)}`)

  try {
    const form = await req.formData()
    const get = (k: string) => (form.get(k) ?? '').toString()

    const ordrIdxx = get('ordr_idxx')
    const encData = get('enc_data')
    const encInfo = get('enc_info')
    const tranCd = get('tran_cd')
    const authResCd = get('res_cd')

    if (authResCd && authResCd !== '0000') {
      return fail(get('res_msg') || '카드 등록이 취소되었습니다')
    }
    if (!ordrIdxx || !encData || !encInfo || !tranCd) {
      console.error('[KCP billing ret] 필수 파라미터 누락. 수신 키:', [...form.keys()])
      return fail('결제 정보가 올바르지 않습니다')
    }

    const db = createServiceClient()
    const dbAny = db as unknown as SupabaseClient
    const { data: order } = await dbAny
      .from('kcp_payment_orders')
      .select('business_id, plan_id, amount, status')
      .eq('ordr_idxx', ordrIdxx)
      .maybeSingle() as unknown as {
        data: { business_id: string; plan_id: string; amount: number; status: string } | null
      }

    if (!order) return fail('주문 정보를 찾을 수 없습니다')
    if (order.status === 'paid') {
      return redirectTo(`status=paid&ordr=${ordrIdxx}&amount=${order.amount}&plan=${order.plan_id}`)
    }

    // 빌키 발급 승인 (금액은 가맹점 DB 원본값 사용)
    const approve = await approveBillingKeyIssue({
      encData, encInfo, tranCd, ordrIdxx, ordrMony: order.amount,
    })

    if (!approve.ok || !approve.batchKey) {
      console.error('[KCP billing ret] 빌키 발급 실패:', approve.resCd, approve.raw)
      await dbAny.from('kcp_payment_orders').update({ status: 'failed' }).eq('ordr_idxx', ordrIdxx)
      return fail(approve.resMsg || '카드 등록에 실패했습니다')
    }

    // 첫 달 결제 금액 검증(빌키발급과 동시 결제한 경우)
    if (approve.amount != null && approve.amount !== order.amount) {
      console.error('[KCP billing ret] 금액 불일치:', { paid: approve.amount, expected: order.amount })
      return fail('결제 금액이 올바르지 않습니다')
    }

    // 구독 활성화 + 빌키 저장 (다음 달부터 cron이 이 빌키로 자동청구)
    const now = new Date()
    const nextMonth = new Date(now)
    nextMonth.setMonth(nextMonth.getMonth() + 1)

    const { data: existing } = await db
      .from('subscriptions')
      .select('id, next_plan' as never)
      .eq('business_id', order.business_id)
      .maybeSingle() as unknown as { data: { id: string; next_plan: string | null } | null }

    const effectivePlan = existing?.next_plan ?? order.plan_id
    const fields = {
      plan: effectivePlan,
      status: 'active',
      payment_id: ordrIdxx,
      toss_order_id: ordrIdxx,
      toss_payment_key: approve.tno ?? ordrIdxx,
      billing_key: approve.batchKey,          // ★ 빌키 저장 — 자동청구의 핵심
      current_period_start: now.toISOString(),
      current_period_end: nextMonth.toISOString(),
      next_plan: null,
    }

    if (existing) {
      await db.from('subscriptions').update(fields as never).eq('id', existing.id)
    } else {
      await db.from('subscriptions').insert({ business_id: order.business_id, ...fields } as never)
    }

    await dbAny.from('kcp_payment_orders')
      .update({ status: 'paid', kcp_tno: approve.tno ?? null, paid_at: now.toISOString() })
      .eq('ordr_idxx', ordrIdxx)

    return redirectTo(`status=paid&ordr=${ordrIdxx}&amount=${order.amount}&plan=${effectivePlan}`)
  } catch (e) {
    console.error('[KCP billing ret] 예기치 못한 오류:', e)
    return fail('결제 처리 중 오류가 발생했습니다')
  }
}
