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

// KCP 거래등록 — 결제창 URL(pay_url)을 받아 클라이언트가 리다이렉트한다.
// ordr_idxx는 길이 제한이 있어 짧게 생성하고, kcp_payment_orders에 pending으로 저장(리턴 시 조회).
export const registerKcpPaymentAction = action
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

    // 짧은 주문번호 (예: Q + base36 타임스탬프 + 6 hex) — KCP ordr_idxx 길이 제한 대응
    const ordrIdxx = `Q${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.toUpperCase()

    // pending 주문 저장 (리턴 시 위변조 검증·구독 활성화의 기준)
    // kcp_payment_orders는 database.ts 타입 미반영 → 캐스팅
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
      console.error('[KCP] 주문 저장 실패:', insErr)
      throw new Error('[APP] 결제 준비 중 오류가 발생했습니다')
    }

    // 인증결과를 수신할 서버 URL (현재 요청 호스트 기준)
    const h = await headers()
    const host = h.get('host')
    const proto = h.get('x-forwarded-proto') ?? 'https'
    const retUrl = `${proto}://${host}/api/payment/kcp-return`

    const result = await registerPayment({
      ordrIdxx,
      goodMny: amount,
      goodName: `퀄리오 ${planLabel} 플랜 1개월`,
      retUrl,
    })

    if (!result.ok || !result.payUrl) {
      console.error('[KCP] 거래등록 실패:', result.raw)
      throw new Error('[APP] 결제창을 열지 못했어요. 잠시 후 다시 시도해주세요.')
    }

    return { payUrl: result.payUrl }
  })
