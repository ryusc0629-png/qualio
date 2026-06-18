'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

const VALID_PLANS = Object.keys(PLANS)

// 플랜 변경 예약 — 다음 결제 기간부터 적용
export const schedulePlanChangeAction = action
  .schema(
    z.object({
      nextPlan: z.string().refine(
        (v) => VALID_PLANS.includes(v) && v !== 'beta',
        { message: '유효하지 않은 플랜입니다' }
      ),
    })
  )
  .action(async ({ parsedInput: { nextPlan } }) => {
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

    // 현재 구독 확인
    const { data: subscription } = await db
      .from('subscriptions')
      .select('id, plan, status')
      .eq('business_id', profile.business_id)
      .maybeSingle()

    if (!subscription) throw new Error('[APP] 구독 정보를 찾을 수 없습니다')

    // 현재 플랜과 동일하면 예약 취소
    if (subscription.plan === nextPlan) {
      await db
        .from('subscriptions')
        .update({ next_plan: null } as never)
        .eq('id', subscription.id)

      revalidatePath('/dashboard/settings')
      revalidatePath('/upgrade')
      return { cancelled: true }
    }

    // 다음 플랜 저장
    await db
      .from('subscriptions')
      .update({ next_plan: nextPlan } as never)
      .eq('id', subscription.id)

    const planLabel = PLANS[nextPlan as PlanId]?.label ?? nextPlan

    revalidatePath('/dashboard/settings')
    revalidatePath('/upgrade')
    return { scheduled: true, planLabel }
  })

// 플랜 변경 예약 취소
export const cancelPlanChangeAction = action
  .schema(z.object({}))
  .action(async () => {
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

    await db
      .from('subscriptions')
      .update({ next_plan: null } as never)
      .eq('business_id', profile.business_id)

    revalidatePath('/dashboard/settings')
    revalidatePath('/upgrade')
    return { cancelled: true }
  })
