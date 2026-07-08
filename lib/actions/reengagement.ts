'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getBusinessId() {
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
  return { db, businessId: profile.business_id }
}

// 발송 처리(검토 완료) — 지금은 대표가 카톡으로 직접 보낸 뒤 '보냈어요'로 표시.
// 고객 재유도 이력도 남겨(customers.reengagement_sent_at) 중복 유도를 막는다.
// → 문자(SMS) 자동발송/개인화 알림톡 승인 시, 이 자리에서 실제 발송 호출로 승격하면 된다.
export const sendReengagementAction = action
  .schema(z.object({ dispatchId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    const looseDb = db as unknown as SupabaseClient

    const { data: dispatch } = await looseDb
      .from('reengagement_dispatches')
      .select('status, customer_phone')
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as { data: { status: string; customer_phone: string } | null }

    if (!dispatch) throw new Error('[APP] 대상을 찾을 수 없습니다')
    if (dispatch.status !== 'pending') throw new Error('[APP] 이미 처리된 건이에요')

    const { error } = await looseDb
      .from('reengagement_dispatches')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)
    if (error) throw new Error('[APP] 처리에 실패했어요')

    // 재유도 이력 기록(중복 유도 방지) — 고객 DB에 있을 때만
    await db
      .from('customers')
      .update({ reengagement_sent_at: new Date().toISOString() })
      .eq('business_id', businessId)
      .eq('phone', dispatch.customer_phone)

    revalidatePath('/dashboard/reengagement')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 건너뛰기
export const skipReengagementAction = action
  .schema(z.object({ dispatchId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    const looseDb = db as unknown as SupabaseClient

    const { error } = await looseDb
      .from('reengagement_dispatches')
      .update({ status: 'skipped', sent_at: new Date().toISOString() })
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)
      .eq('status', 'pending')
    if (error) throw new Error('[APP] 처리에 실패했어요')

    revalidatePath('/dashboard/reengagement')
    revalidatePath('/dashboard')
    return { success: true }
  })
