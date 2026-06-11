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

// 고객 등록
const createCustomerSchema = z.object({
  name: z.string().min(1, '고객명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  address: z.string().optional(),
  category: z.string().optional(),
  type: z.string().refine((v) => ['recurring', 'one_time'].includes(v), '유효하지 않은 고객 유형입니다'),
  lead_id: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional(),
})

export const createCustomerAction = action
  .schema(createCustomerSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db.from('customers').insert({
      business_id: businessId,
      name: parsedInput.name,
      phone: parsedInput.phone,
      address: parsedInput.address || null,
      category: parsedInput.category || null,
      type: parsedInput.type,
      lead_id: parsedInput.lead_id || null,
      notes: parsedInput.notes || null,
    })

    if (error) throw new Error('[APP] 고객 등록에 실패했습니다')

    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 고객 정보 수정
const updateCustomerSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1, '고객명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  address: z.string().optional(),
  category: z.string().optional(),
  type: z.string().refine((v) => ['recurring', 'one_time'].includes(v), '유효하지 않은 고객 유형입니다'),
  notes: z.string().optional(),
})

export const updateCustomerAction = action
  .schema(updateCustomerSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('customers')
      .update({
        name: parsedInput.name,
        phone: parsedInput.phone,
        address: parsedInput.address || null,
        category: parsedInput.category || null,
        type: parsedInput.type,
        notes: parsedInput.notes || null,
      })
      .eq('id', parsedInput.customerId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 고객 정보 수정에 실패했습니다')

    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 고객 + 계약 동시 등록 (CRM 계약완료 → 고객 전환용)
const createCustomerWithContractSchema = z.object({
  name: z.string().min(1, '고객명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  address: z.string().optional(),
  category: z.string().optional(),
  lead_id: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional(),
  // 계약 정보 (선택)
  hasContract: z.string().optional(), // 'true' or ''
  service_type: z.string().optional(),
  frequency: z.string().optional(),
  contract_price: z.string().optional(),
  start_date: z.string().optional(),
})

export const createCustomerWithContractAction = action
  .schema(createCustomerWithContractSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 1. 고객 등록
    const type = parsedInput.hasContract === 'true' ? 'recurring' : 'one_time'

    const { data: customer, error: customerError } = await db
      .from('customers')
      .insert({
        business_id: businessId,
        name: parsedInput.name,
        phone: parsedInput.phone,
        address: parsedInput.address || null,
        category: parsedInput.category || null,
        type,
        lead_id: parsedInput.lead_id || null,
        notes: parsedInput.notes || null,
      })
      .select('id')
      .single()

    if (customerError || !customer) throw new Error('[APP] 고객 등록에 실패했습니다')

    // 2. 계약 등록 (선택)
    if (parsedInput.hasContract === 'true') {
      if (!parsedInput.service_type) throw new Error('[APP] 서비스 유형을 입력해주세요')
      if (!parsedInput.frequency) throw new Error('[APP] 방문 주기를 선택해주세요')
      if (!parsedInput.contract_price) throw new Error('[APP] 계약금액을 입력해주세요')
      if (!parsedInput.start_date) throw new Error('[APP] 시작일을 입력해주세요')

      const price = parseInt(parsedInput.contract_price, 10)
      if (isNaN(price) || price < 1) throw new Error('[APP] 올바른 계약금액을 입력해주세요')

      const { error: contractError } = await db.from('contracts').insert({
        business_id: businessId,
        customer_id: customer.id,
        service_type: parsedInput.service_type,
        frequency: parsedInput.frequency,
        contract_price: price,
        start_date: parsedInput.start_date,
      })

      if (contractError) throw new Error('[APP] 계약 등록에 실패했습니다')
    }

    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 고객 삭제
const deleteCustomerSchema = z.object({
  customerId: z.string().uuid(),
})

export const deleteCustomerAction = action
  .schema(deleteCustomerSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 연결된 contracts는 ON DELETE CASCADE로 자동 삭제됨
    const { error } = await db
      .from('customers')
      .delete()
      .eq('id', parsedInput.customerId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 삭제에 실패했습니다')

    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard')
    return { success: true }
  })
