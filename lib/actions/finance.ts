'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// 인증 + 업체ID 확인 (프로젝트 공통 패턴)
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

// YYYY-MM-DD 형식 검증
const dateRegex = /^\d{4}-\d{2}-\d{2}$/

// ── 거래 기록(매출/지출) 추가 ────────────────────────────────
const addEntrySchema = z.object({
  type: z.string().refine(
    (v) => ['revenue', 'expense'].includes(v),
    '매출 또는 지출을 선택해주세요',
  ),
  amount: z.coerce.number().int().min(1, '금액을 입력해주세요'),
  category: z.string().min(1, '분류를 선택해주세요'),
  entry_date: z.string().refine((v) => dateRegex.test(v), '날짜를 선택해주세요'),
  memo: z.string().max(200).optional(),
})

export const addFinanceEntryAction = action
  .schema(addEntrySchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db.from('finance_entries').insert({
      business_id: businessId,
      entry_date: parsedInput.entry_date,
      type: parsedInput.type,
      category: parsedInput.category,
      amount: parsedInput.amount,
      memo: parsedInput.memo?.trim() || null,
    })

    if (error) {
      console.error('[Finance] 기록 추가 실패:', error)
      throw new Error('[APP] 저장 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/finance')
    return { success: true }
  })

// ── 거래 기록 삭제 ──────────────────────────────────────────
export const deleteFinanceEntryAction = action
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db
      .from('finance_entries')
      .delete()
      .eq('id', parsedInput.id)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Finance] 기록 삭제 실패:', error)
      throw new Error('[APP] 삭제 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/finance')
    return { success: true }
  })

// ── 거래 기록 수정 ──────────────────────────────────────────
const updateEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.string().refine(
    (v) => ['revenue', 'expense'].includes(v),
    '매출 또는 지출을 선택해주세요',
  ),
  amount: z.coerce.number().int().min(1, '금액을 입력해주세요'),
  category: z.string().min(1, '분류를 선택해주세요'),
  entry_date: z.string().refine((v) => dateRegex.test(v), '날짜를 선택해주세요'),
  memo: z.string().max(200).optional(),
})

export const updateFinanceEntryAction = action
  .schema(updateEntrySchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db
      .from('finance_entries')
      .update({
        entry_date: parsedInput.entry_date,
        type: parsedInput.type,
        category: parsedInput.category,
        amount: parsedInput.amount,
        memo: parsedInput.memo?.trim() || null,
      })
      .eq('id', parsedInput.id)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Finance] 기록 수정 실패:', error)
      throw new Error('[APP] 수정 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/finance')
    return { success: true }
  })

// ── 고정비 추가 ────────────────────────────────────────────
const addFixedCostSchema = z.object({
  name: z.string().min(1, '항목 이름을 입력해주세요').max(40),
  monthly_amount: z.coerce.number().int().min(1, '월 금액을 입력해주세요'),
})

export const addFixedCostAction = action
  .schema(addFixedCostSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db.from('fixed_costs').insert({
      business_id: businessId,
      name: parsedInput.name.trim(),
      monthly_amount: parsedInput.monthly_amount,
      active: true,
    })

    if (error) {
      console.error('[Finance] 고정비 추가 실패:', error)
      throw new Error('[APP] 저장 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/finance')
    return { success: true }
  })

// ── 고정비 수정 (이름·월 금액) ──────────────────────────────
const updateFixedCostSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, '항목 이름을 입력해주세요').max(40),
  monthly_amount: z.coerce.number().int().min(1, '월 금액을 입력해주세요'),
})

export const updateFixedCostAction = action
  .schema(updateFixedCostSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db
      .from('fixed_costs')
      .update({ name: parsedInput.name.trim(), monthly_amount: parsedInput.monthly_amount })
      .eq('id', parsedInput.id)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Finance] 고정비 수정 실패:', error)
      throw new Error('[APP] 수정 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/finance')
    return { success: true }
  })

// ── 고정비 켜기/끄기 (손익분기점 계산 포함 여부) ─────────────
export const toggleFixedCostAction = action
  .schema(z.object({ id: z.string().uuid(), active: z.boolean() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db
      .from('fixed_costs')
      .update({ active: parsedInput.active })
      .eq('id', parsedInput.id)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Finance] 고정비 상태 변경 실패:', error)
      throw new Error('[APP] 변경 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/finance')
    return { success: true }
  })

// ── 고정비 삭제 ────────────────────────────────────────────
export const deleteFixedCostAction = action
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db
      .from('fixed_costs')
      .delete()
      .eq('id', parsedInput.id)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Finance] 고정비 삭제 실패:', error)
      throw new Error('[APP] 삭제 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/finance')
    return { success: true }
  })
