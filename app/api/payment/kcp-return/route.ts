import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { approvePayment } from '@/lib/payments/kcp'

// KCP 결제창 인증 결과 수신(POST 폼) → 승인 → 위변조 검증 → 구독 활성화 → 성공 페이지로
// ⚠️ KCP는 크로스사이트 폼 POST라 세션 쿠키가 없을 수 있음 → ordr_idxx(주문 매핑)+승인 금액으로 검증
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
    const authResCd = get('res_cd') // 결제창 인증결과 코드

    // 인증 실패/취소
    if (authResCd && authResCd !== '0000') {
      return fail(get('res_msg') || '결제가 취소되었습니다')
    }
    if (!ordrIdxx || !encData || !encInfo || !tranCd) {
      console.error('[KCP ret] 필수 파라미터 누락. 수신 키:', [...form.keys()])
      return fail('결제 정보가 올바르지 않습니다')
    }

    const db = createServiceClient()
    // kcp_payment_orders는 database.ts 타입 미반영 → 캐스팅 핸들
    const dbAny = db as unknown as SupabaseClient
    const { data: order } = await dbAny
      .from('kcp_payment_orders')
      .select('business_id, plan_id, amount, status')
      .eq('ordr_idxx', ordrIdxx)
      .maybeSingle() as unknown as {
        data: { business_id: string; plan_id: string; amount: number; status: string } | null
      }

    if (!order) return fail('주문 정보를 찾을 수 없습니다')
    // 이미 처리된 결제 → 성공 페이지로 (중복 방지)
    if (order.status === 'paid') {
      return redirectTo(`status=paid&ordr=${ordrIdxx}&amount=${order.amount}&plan=${order.plan_id}`)
    }

    // 결제 승인 (금액은 가맹점 DB 원본값 사용 — 위변조 방지)
    const approve = await approvePayment({
      encData, encInfo, tranCd, ordrIdxx, ordrMony: order.amount, payType: 'PACA',
    })

    if (!approve.ok) {
      console.error('[KCP ret] 승인 실패:', approve.resCd, approve.raw)
      await dbAny.from("kcp_payment_orders").update({ status: "failed" }).eq('ordr_idxx', ordrIdxx)
      return fail(approve.resMsg || '결제 승인에 실패했습니다')
    }

    // 실제 승인 금액 == 기대 금액 검증
    if (approve.amount != null && approve.amount !== order.amount) {
      console.error('[KCP ret] 금액 불일치:', { paid: approve.amount, expected: order.amount })
      return fail('결제 금액이 올바르지 않습니다')
    }

    // 구독 활성화 (1개월 이용권)
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
      toss_order_id: ordrIdxx,                 // 레거시 컬럼 재사용
      toss_payment_key: approve.tno ?? ordrIdxx,
      current_period_start: now.toISOString(),
      current_period_end: nextMonth.toISOString(),
      next_plan: null,
    }

    if (existing) {
      await db.from('subscriptions').update(fields as never).eq('id', existing.id)
    } else {
      await db.from('subscriptions').insert({ business_id: order.business_id, ...fields } as never)
    }

    await dbAny.from("kcp_payment_orders").update({ status: "paid", kcp_tno: approve.tno ?? null, paid_at: now.toISOString() })
      .eq('ordr_idxx', ordrIdxx)

    return redirectTo(`status=paid&ordr=${ordrIdxx}&amount=${order.amount}&plan=${effectivePlan}`)
  } catch (e) {
    console.error('[KCP ret] 예기치 못한 오류:', e)
    return fail('결제 처리 중 오류가 발생했습니다')
  }
}
