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

    revalidatePath('/dashboard/customers')
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

    revalidatePath('/dashboard/customers')
    return { success: true }
  })
