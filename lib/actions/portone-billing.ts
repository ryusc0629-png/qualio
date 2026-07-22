'use server'

import { z } from 'zod'
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getPlanPrice, PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

const PAID_PLAN_IDS = ['starter', 'pro', 'scale']

// 포트원 정기결제(빌키) 주문 생성.
// KCP는 paymentId가 최대 40자·영숫자여야 하므로 짧은 주문번호를 서버에서 채번하고
// kcp_payment_orders에 pending으로 저장한다(빌키 발급 후 리턴에서 조회·검증의 기준).
// 빌키 발급창에 필요한 issueId·issueName·customer(전화·이메일)도 함께 내려준다.
export const createBillingOrderAction = action
  .schema(
    z.object({
      planId: z.string().refine((v) => PAID_PLAN_IDS.includes(v), {
        message: '유효하지 않은 플랜입니다',
      }),
    })
  )
  .action(async ({ parsedInput: { planId } }) => {
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id, businesses!business_id(name, phone)')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const businessId = profile.business_id
    const biz = profile.businesses as { name: string; phone: string | null } | null
    const amount = getPlanPrice(planId as PlanId)
    const planLabel = PLANS[planId as PlanId]?.label ?? planId

    // 짧은 주문번호 (예: Q + base36 타임스탬프 + 6 hex) — KCP paymentId 길이·문자 제약 대응
    const orderId = `Q${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.toUpperCase()

    const { error: insErr } = await (db as unknown as SupabaseClient)
      .from('kcp_payment_orders')
      .insert({
        ordr_idxx: orderId,
        business_id: businessId,
        plan_id: planId,
        amount,
        status: 'pending',
      })
    if (insErr) {
      console.error('[Billing] 주문 저장 실패:', insErr)
      throw new Error('[APP] 결제 준비 중 오류가 발생했습니다')
    }

    // 전화번호는 숫자만 (KCP 요구 형식)
    const phoneNumber = (biz?.phone ?? '').replace(/[^0-9]/g, '') || undefined

    return {
      orderId,
      issueName: `퀄리오 ${planLabel} 플랜 정기결제`,
      displayAmount: amount,
      customer: {
        customerId: businessId,
        fullName: biz?.name ?? undefined,
        phoneNumber,
        email: user.email ?? undefined,
      },
    }
  })
