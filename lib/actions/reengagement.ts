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
      .in('status', ['pending', 'scheduled'])
    if (error) throw new Error('[APP] 처리에 실패했어요')

    revalidatePath('/dashboard/reengagement')
    revalidatePath('/dashboard')
    return { success: true }
  })

// ── 현장에서 올린 '다음에 제안할 서비스' ────────────────────────────
//
// 현장 직원이 고르면 검토 대기(pending)로 쌓인다. 대표가 여기서 승인해야(scheduled)
// 정해진 날짜에 문자가 나간다. 승인 전에는 고객에게 아무것도 가지 않는다.

// 승인 — 문구를 확정하고 발송 예약 상태로 바꾼다.
//
// channel은 사장님이 건별로 고른다:
//   'sms'    그날 문자가 자동으로 나간다. 편하지만 건당 요금이 든다(LMS)
//   'manual' 그날 알림만 받고 사장님이 전화한다. 돈이 안 들고, 재구매는 통화가 더 잘 된다
export const approveSuggestionAction = action
  .schema(z.object({
    dispatchId: z.string().uuid(),
    // 사장님이 화면에서 문구를 '직접 고쳤을 때만' 보낸다.
    // 안 고쳤는데도 보내면, 화면을 띄워둔 사이 서버에서 갱신된 문구(현장이 문장을 다듬은 결과)를
    // 낡은 화면 값으로 덮어쓴다. 실제로 그렇게 메모체가 되살아났다(2026-08-21).
    message:    z.string().min(10, '문구를 적어주세요').max(1000).optional(),
    channel:    z.string().refine((v) => ['sms', 'manual'].includes(v), '보내는 방법을 골라주세요'),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    const looseDb = db as unknown as SupabaseClient

    const { data: row } = (await looseDb
      .from('reengagement_dispatches')
      .select('status, due_at')
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)
      .maybeSingle()) as unknown as { data: { status: string; due_at: string | null } | null }

    if (!row) throw new Error('[APP] 대상을 찾을 수 없습니다')
    if (row.status !== 'pending') throw new Error('[APP] 이미 처리된 건이에요')

    const { error } = await looseDb
      .from('reengagement_dispatches')
      .update({
        status: 'scheduled',
        // 안 고쳤으면 서버에 있는 최신 문구를 그대로 둔다
        ...(parsedInput.message ? { message: parsedInput.message } : {}),
        channel: parsedInput.channel,
        approved_at: new Date().toISOString(),
      })
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)
    if (error) throw new Error('[APP] 승인에 실패했어요. 다시 눌러주세요')

    revalidatePath('/dashboard/reengagement')
    revalidatePath('/dashboard')
    return { success: true, dueAt: row.due_at }
  })

// 현장이 직접 적은 서비스명을 업체 서비스 항목으로 등록한다.
// (현장이 실제로 파는 것을 사장님이 뒤늦게 알게 되는 통로)
export const registerSuggestedServiceAction = action
  .schema(z.object({
    name:      z.string().min(1).max(60),
    basePrice: z.number().int().min(0).max(100_000_000).optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { data: exists } = await db
      .from('service_items')
      .select('id')
      .eq('business_id', businessId)
      .eq('name', parsedInput.name)
      .is('deleted_at', null)
      .maybeSingle()

    if (exists) return { success: true, alreadyExists: true }

    const { error } = await db.from('service_items').insert({
      business_id: businessId,
      name:        parsedInput.name,
      base_price:  parsedInput.basePrice ?? 0,
    } as never)
    if (error) {
      console.error('[Reengagement] 서비스 등록 실패:', error)
      throw new Error('[APP] 서비스를 등록하지 못했어요. 서비스 화면에서 추가해주세요')
    }

    revalidatePath('/dashboard/services')
    revalidatePath('/dashboard/reengagement')
    return { success: true, alreadyExists: false }
  })
