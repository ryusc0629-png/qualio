'use server'

import { z } from 'zod'
import crypto from 'crypto'
import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { registerPayment } from '@/lib/payments/kcp'
import { getPlanPrice, PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

const PAID_PLAN_IDS = ['starter', 'pro', 'scale']

// 정기결제(빌키) 등록 — 표준결제창을 BATCH로 열어 카드 등록 → 빌키 발급(+첫 달 결제).
// 일반결제(registerKcpPaymentAction)와 거의 동일하나 ①pay_method=BATCH ②리턴 URL이 빌링 전용.
// ⚠️ KCP 정기결제 개통 후에만 실제 동작. 개통 전엔 거래등록에서 S032가 날 수 있음.
export const registerBillingAction = action
  .schema(
    z.object({
      planId: z.string().refine((v) => PAID_PLAN_IDS.includes(v), {
        message: '유효하지 않은 플랜입니다',
      }),
    })
  )
  .action(async ({ parsedInput: { planId } }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const businessId = profile.business_id
    const amount = getPlanPrice(planId as PlanId)
    const planLabel = PLANS[planId as PlanId]?.label ?? planId

    // 빌키 발급용 주문 (일반결제와 같은 테이블 재사용 — 리턴 URL이 흐름을 구분)
    const ordrIdxx = `QB${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.toUpperCase()

    const { error: insErr } = await (db as unknown as SupabaseClient)
      .from('kcp_payment_orders')
      .insert({
        ordr_idxx: ordrIdxx,
        business_id: businessId,
        plan_id: planId,
        amount,
        status: 'pending',
      })
    if (insErr) {
      console.error('[KCP billing] 주문 저장 실패:', insErr)
      throw new Error('[APP] 결제 준비 중 오류가 발생했습니다')
    }

    const h = await headers()
    const host = h.get('host')
    const proto = h.get('x-forwarded-proto') ?? 'https'
    const baseUrl = `${proto}://${host}`
    // [KCP-SPEC] BATCH(빌키발급) 거래등록 — 개통 후 pay_method/서명 형식 최종 확인
    const result = await registerPayment({
      ordrIdxx,
      goodMny: amount,
      goodName: `퀄리오 ${planLabel} 플랜 정기결제`,
      payMethod: 'BATCH',
      retUrl: `${baseUrl}/api/payment/kcp-billing-return`,
      failUrl: `${baseUrl}/upgrade/success?status=fail`,
    })

    if (!result.ok || !result.payUrl) {
      console.error('[KCP billing] 거래등록 실패:', result.raw)
      throw new Error('[APP] 결제창을 열지 못했어요. 잠시 후 다시 시도해주세요.')
    }

    return { payUrl: result.payUrl }
  })
