'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'

// 공통 인증 헬퍼
async function getAuthenticatedBusinessId() {
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

// 정기계약 등록
const createContractSchema = z.object({
  customer_id: z.string().uuid('고객을 선택해주세요'),
  service_type: z.string().min(1, '서비스 유형을 입력해주세요'),
  frequency: z.string().refine(
    (v) => ['weekly', 'biweekly', 'monthly'].includes(v),
    '유효하지 않은 주기입니다'
  ),
  contract_price: z.coerce.number().min(1, '계약금액을 입력해주세요'),
  start_date: z.string().min(1, '시작일을 입력해주세요'),
  end_date: z.string().optional(),
  notes: z.string().optional(),
})

export const createContractAction = action
  .schema(createContractSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 해당 고객이 이 business 소속인지 확인
    const { data: customer } = await db
      .from('customers')
      .select('id')
      .eq('id', parsedInput.customer_id)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!customer) throw new Error('[APP] 유효하지 않은 고객입니다')

    const { error } = await db.from('contracts').insert({
      business_id: businessId,
      customer_id: parsedInput.customer_id,
      service_type: parsedInput.service_type,
      frequency: parsedInput.frequency,
      contract_price: parsedInput.contract_price,
      start_date: parsedInput.start_date,
      end_date: parsedInput.end_date || null,
      notes: parsedInput.notes || null,
    })

    if (error) throw new Error('[APP] 계약 등록에 실패했습니다')

    // 해당 고객 type을 recurring으로 변경
    await db
      .from('customers')
      .update({ type: 'recurring' })
      .eq('id', parsedInput.customer_id)
      .eq('business_id', businessId)

    revalidatePath('/dashboard/contracts')
    revalidatePath('/dashboard/customers')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 계약 상태 변경
const updateContractStatusSchema = z.object({
  contractId: z.string().uuid(),
  status: z.string().refine(
    (v) => ['active', 'paused', 'terminated'].includes(v),
    '유효하지 않은 상태입니다'
  ),
})

export const updateContractStatusAction = action
  .schema(updateContractStatusSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('contracts')
      .update({ status: parsedInput.status })
      .eq('id', parsedInput.contractId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 계약 상태 변경에 실패했습니다')

    revalidatePath('/dashboard/contracts')
    revalidatePath('/dashboard')
    return { success: true }
  })
