'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'quoted', 'contracted', 'rejected'] as const

// 잠재고객 추가 스키마
const createLeadSchema = z.object({
  company_name: z.string().min(1, '업체명을 입력해주세요'),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  next_follow_up_date: z.string().optional(),
  notes: z.string().optional(),
})

// 상태 변경 스키마
const updateLeadStatusSchema = z.object({
  leadId: z.string().uuid(),
  status: z.string().refine((v) => LEAD_STATUSES.includes(v as typeof LEAD_STATUSES[number]), '유효하지 않은 상태입니다'),
})

// 리드 수정 스키마
const updateLeadSchema = z.object({
  leadId: z.string().uuid(),
  company_name: z.string().min(1, '업체명을 입력해주세요'),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  next_follow_up_date: z.string().optional(),
  notes: z.string().optional(),
})

// 삭제 스키마
const deleteLeadSchema = z.object({
  leadId: z.string().uuid(),
})

// 견적 → 잠재고객 전환 스키마
const createLeadFromQuoteSchema = z.object({
  customerName:  z.string().min(1),
  customerPhone: z.string().min(1),
  cleaningType:  z.string().optional(),
})

// 견적 → 잠재고객 전환
export const createLeadFromQuoteAction = action
  .schema(createLeadFromQuoteSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db.from('leads').insert({
      business_id:  businessId,
      company_name: parsedInput.customerName,
      phone:        parsedInput.customerPhone,
      notes:        parsedInput.cleaningType ? `견적 요청: ${parsedInput.cleaningType}` : '견적 요청 고객',
      status:       'new',
    })

    if (error) throw new Error('[APP] 잠재고객 등록에 실패했습니다')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 인증 + business_id 조회 헬퍼
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

// 잠재고객 추가
export const createLeadAction = action
  .schema(createLeadSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db.from('leads').insert({
      business_id: businessId,
      company_name: parsedInput.company_name,
      contact_name: parsedInput.contact_name ?? null,
      phone: parsedInput.phone ?? null,
      address: parsedInput.address ?? null,
      category: parsedInput.category ?? null,
      next_follow_up_date: parsedInput.next_follow_up_date ?? null,
      notes: parsedInput.notes ?? null,
    })

    if (error) throw new Error('[APP] 잠재고객 추가에 실패했습니다')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 상태 변경
export const updateLeadStatusAction = action
  .schema(updateLeadStatusSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('leads')
      .update({ status: parsedInput.status })
      .eq('id', parsedInput.leadId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 상태 변경에 실패했습니다')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 리드 수정
export const updateLeadAction = action
  .schema(updateLeadSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('leads')
      .update({
        company_name: parsedInput.company_name,
        contact_name: parsedInput.contact_name ?? null,
        phone: parsedInput.phone ?? null,
        address: parsedInput.address ?? null,
        category: parsedInput.category ?? null,
        next_follow_up_date: parsedInput.next_follow_up_date ?? null,
        notes: parsedInput.notes ?? null,
      })
      .eq('id', parsedInput.leadId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 수정에 실패했습니다')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 삭제
export const deleteLeadAction = action
  .schema(deleteLeadSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('leads')
      .delete()
      .eq('id', parsedInput.leadId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 삭제에 실패했습니다')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })
