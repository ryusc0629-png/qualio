'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMonthlyPayroll, monthRangeUtc } from '@/lib/payroll/data'
import { PAY_TYPE_LABEL } from '@/lib/payroll/compute'

async function getBusinessId() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) throw new Error('[APP] 로그인이 필요합니다')
  const db = createServiceClient() as unknown as SupabaseClient
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()
  const businessId = (profile as { business_id?: string } | null)?.business_id
  if (!businessId) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')
  return { db, businessId }
}

// 직원/도급사 급여 단가 설정
export const updateWorkerPayAction = action
  .schema(z.object({
    workerId: z.string().uuid(),
    payType: z.string().refine(
      (v) => ['monthly', 'hourly', 'daily', 'per_visit'].includes(v),
      '급여 방식을 선택해주세요',
    ),
    payRate: z.coerce.number().int().min(0).max(100_000_000),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    const { error } = await db
      .from('workers')
      .update({ pay_type: parsedInput.payType, pay_rate: parsedInput.payRate } as never)
      .eq('id', parsedInput.workerId)
      .eq('business_id', businessId)
    if (error) throw new Error('[APP] 단가 저장에 실패했어요. 다시 시도해주세요')
    revalidatePath('/dashboard/payroll')
    return { success: true }
  })

// 현장 일당·추가 업무 수당 등 기본급 위에 얹는 줄 추가
export const addPayrollEntryAction = action
  .schema(z.object({
    workerId: z.string().uuid(),
    month: z.string().regex(/^\d{4}-\d{2}$/, '월 형식이 올바르지 않습니다'),
    bookingId: z.string().uuid().nullable().optional(),
    label: z.string().trim().min(1, '어떤 돈인지 적어주세요').max(60),
    amount: z.coerce.number().int().min(-100_000_000).max(100_000_000)
      .refine((v) => v !== 0, '금액을 넣어주세요'),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    // 다른 업체의 직원에 줄을 붙이지 못하게 막는다
    const { data: worker } = await db
      .from('workers')
      .select('id')
      .eq('id', parsedInput.workerId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!worker) throw new Error('[APP] 직원을 찾을 수 없어요')

    const { error } = await db.from('payroll_entries').insert({
      business_id: businessId,
      worker_id: parsedInput.workerId,
      month: parsedInput.month,
      booking_id: parsedInput.bookingId ?? null,
      label: parsedInput.label,
      amount: parsedInput.amount,
    } as never)
    if (error) {
      console.error('[Payroll] 추가 지급 저장 실패:', error)
      throw new Error('[APP] 저장 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/payroll')
    revalidatePath('/dashboard/finance')
    return { success: true }
  })

// 추가 지급·공제 줄 삭제
export const deletePayrollEntryAction = action
  .schema(z.object({ entryId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    const { error } = await db
      .from('payroll_entries')
      .delete()
      .eq('id', parsedInput.entryId)
      .eq('business_id', businessId)
    if (error) {
      console.error('[Payroll] 추가 지급 삭제 실패:', error)
      throw new Error('[APP] 지우지 못했어요. 다시 눌러주세요')
    }
    revalidatePath('/dashboard/payroll')
    revalidatePath('/dashboard/finance')
    return { success: true }
  })

// 이 달 급여를 장부(매출·지출)에 인건비 지출로 반영 — 같은 직원·같은 달은 덮어쓰기(중복 방지)
export const postPayrollExpenseAction = action
  .schema(z.object({
    workerId: z.string().uuid(),
    month: z.string().regex(/^\d{4}-\d{2}$/, '월 형식이 올바르지 않습니다'),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    // 서버에서 다시 계산(클라 값 신뢰 안 함)
    const payroll = await getMonthlyPayroll(db, businessId, parsedInput.month)
    const wp = payroll.find((p) => p.worker.id === parsedInput.workerId)
    if (!wp) throw new Error('[APP] 직원을 찾을 수 없어요')
    // 도급사 도급비는 재무의 도급 정산에서 '외주·도급비'로 한 번에 들어간다.
    // 여기서 또 인건비로 넣으면 같은 돈이 장부에 두 번 잡힌다.
    if (wp.isContractor) {
      throw new Error('[APP] 도급비는 재무 > 도급 정산에서 장부에 넣어주세요')
    }
    if (wp.baseBlocked && wp.extraTotal === 0) throw new Error(`[APP] ${wp.baseBlocked}`)
    if (wp.amount <= 0) throw new Error('[APP] 이 달 급여가 0원이라 반영할 게 없어요')

    const { lastDay, label } = monthRangeUtc(parsedInput.month)
    // 같은 직원·같은 달 기존 반영분을 지우고 새로 넣어 중복을 막는다(멱등)
    const tag = `[급여:${parsedInput.workerId}:${parsedInput.month}]`
    await db
      .from('finance_entries')
      .delete()
      .eq('business_id', businessId)
      .eq('type', 'expense')
      .eq('category', '인건비')
      .like('memo', `%${tag}%`)

    const payLabel = wp.worker.pay_type ? PAY_TYPE_LABEL[wp.worker.pay_type] : '급여'
    const { error } = await db.from('finance_entries').insert({
      business_id: businessId,
      entry_date: lastDay,
      type: 'expense',
      category: '인건비',
      amount: wp.amount,
      memo: `${label} 급여 · ${wp.worker.name}(${payLabel}) ${tag}`,
    } as never)
    if (error) throw new Error('[APP] 장부 반영에 실패했어요. 다시 시도해주세요')

    revalidatePath('/dashboard/payroll')
    revalidatePath('/dashboard/finance')
    return { success: true, amount: wp.amount }
  })
