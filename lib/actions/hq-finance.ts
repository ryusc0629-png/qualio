'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSafeActionClient } from 'next-safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import { assertAdmin } from '@/lib/admin/auth'
import { CATEGORY_IDS } from '@/lib/admin/finance-categories'

// 본사 재무 액션 — 관리자(assertAdmin)만 실행
const adminAction = createSafeActionClient({
  handleServerError(e) {
    if (e.message.startsWith('[APP]')) return e.message.replace('[APP] ', '')
    console.error('[HQFinance Error]', e)
    return '요청 처리 중 오류가 발생했습니다'
  },
})

// hq_* 테이블은 database.ts 타입에 없어 loose 클라이언트로 접근
function looseDb(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient
}

const isCategory = (v: string) => CATEGORY_IDS.includes(v)
const isCurrency = (v: string) => ['KRW', 'USD'].includes(v)
const isCycle = (v: string) => ['monthly', 'yearly'].includes(v)

// ── 정기결제(구독) ─────────────────────────────────────────────
const subscriptionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, '이름을 입력해주세요').max(80),
  category: z.string().refine(isCategory, { message: '분류를 선택해주세요' }),
  amount: z.number().positive('금액을 입력해주세요'),
  currency: z.string().refine(isCurrency, { message: '통화를 선택해주세요' }),
  cycle: z.string().refine(isCycle, { message: '결제 주기를 선택해주세요' }),
  next_billing_date: z.string().optional().default(''),
  memo: z.string().max(200).optional().default(''),
})

export const upsertHqSubscriptionAction = adminAction
  .schema(subscriptionSchema)
  .action(async ({ parsedInput }) => {
    await assertAdmin()
    const db = looseDb()
    const row = {
      name: parsedInput.name.trim(),
      category: parsedInput.category,
      amount: parsedInput.amount,
      currency: parsedInput.currency,
      cycle: parsedInput.cycle,
      next_billing_date: parsedInput.next_billing_date || null,
      memo: parsedInput.memo.trim() || null,
    }
    const { error } = parsedInput.id
      ? await db.from('hq_subscriptions').update(row).eq('id', parsedInput.id)
      : await db.from('hq_subscriptions').insert(row)
    if (error) {
      console.error('[HQFinance] 구독 저장 실패:', error)
      throw new Error('[APP] 저장 못 했어요. 다시 눌러주세요')
    }
    revalidatePath('/admin/finance')
    return { success: true }
  })

export const deleteHqSubscriptionAction = adminAction
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput }) => {
    await assertAdmin()
    await looseDb().from('hq_subscriptions').delete().eq('id', parsedInput.id)
    revalidatePath('/admin/finance')
    return { success: true }
  })

export const toggleHqSubscriptionAction = adminAction
  .schema(z.object({ id: z.string().min(1), active: z.boolean() }))
  .action(async ({ parsedInput }) => {
    await assertAdmin()
    await looseDb()
      .from('hq_subscriptions')
      .update({ active: parsedInput.active })
      .eq('id', parsedInput.id)
    revalidatePath('/admin/finance')
    return { success: true }
  })

// ── 일회성 지출 ─────────────────────────────────────────────
const expenseSchema = z.object({
  spent_on: z.string().min(1, '날짜를 선택해주세요'),
  name: z.string().min(1, '항목을 입력해주세요').max(80),
  category: z.string().refine(isCategory, { message: '분류를 선택해주세요' }),
  amount: z.number().positive('금액을 입력해주세요'),
  currency: z.string().refine(isCurrency, { message: '통화를 선택해주세요' }),
  memo: z.string().max(200).optional().default(''),
})

export const addHqExpenseAction = adminAction
  .schema(expenseSchema)
  .action(async ({ parsedInput }) => {
    await assertAdmin()
    const db = looseDb()
    // 입력 시점 환율로 원화 환산해 저장(과거 기록 정확도 보존)
    const { data: settings } = (await db
      .from('hq_settings')
      .select('usd_krw_rate')
      .eq('id', 1)
      .maybeSingle()) as unknown as { data: { usd_krw_rate: number } | null }
    const rate = settings?.usd_krw_rate ?? 1400
    const amountKrw =
      parsedInput.currency === 'USD'
        ? Math.round(parsedInput.amount * rate)
        : Math.round(parsedInput.amount)

    const { error } = await db.from('hq_expenses').insert({
      spent_on: parsedInput.spent_on,
      name: parsedInput.name.trim(),
      category: parsedInput.category,
      amount: parsedInput.amount,
      currency: parsedInput.currency,
      amount_krw: amountKrw,
      memo: parsedInput.memo.trim() || null,
    })
    if (error) {
      console.error('[HQFinance] 지출 저장 실패:', error)
      throw new Error('[APP] 저장 못 했어요. 다시 눌러주세요')
    }
    revalidatePath('/admin/finance')
    return { success: true }
  })

export const deleteHqExpenseAction = adminAction
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput }) => {
    await assertAdmin()
    await looseDb().from('hq_expenses').delete().eq('id', parsedInput.id)
    revalidatePath('/admin/finance')
    return { success: true }
  })

// ── 환율 설정 ─────────────────────────────────────────────
export const updateHqRateAction = adminAction
  .schema(z.object({ usd_krw_rate: z.number().positive('환율을 입력해주세요') }))
  .action(async ({ parsedInput }) => {
    await assertAdmin()
    await looseDb()
      .from('hq_settings')
      .update({ usd_krw_rate: parsedInput.usd_krw_rate, updated_at: new Date().toISOString() })
      .eq('id', 1)
    revalidatePath('/admin/finance')
    return { success: true }
  })
