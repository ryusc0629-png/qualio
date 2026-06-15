'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'quoted', 'negotiating', 'contracted', 'rejected'] as const
const ACTIVITY_TYPES = ['call', 'visit', 'quote', 'note'] as const

// 잠재고객 추가 스키마
const createLeadSchema = z.object({
  company_name: z.string().min(1, '이름 또는 업체명을 입력해주세요'),
  contact_name: z.string().optional(),
  contact_title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  monthly_budget: z.number().optional(),
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
  company_name: z.string().min(1, '이름 또는 업체명을 입력해주세요'),
  contact_name: z.string().optional(),
  contact_title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  monthly_budget: z.number().optional(),
  next_follow_up_date: z.string().optional(),
  notes: z.string().optional(),
})

// 상담 기록 추가 스키마
const createActivitySchema = z.object({
  leadId: z.string().uuid(),
  type: z.string().refine((v) => ACTIVITY_TYPES.includes(v as typeof ACTIVITY_TYPES[number]), '유효하지 않은 유형입니다'),
  content: z.string().min(1, '내용을 입력해주세요'),
  activity_at: z.string().optional(),
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

    const { error } = await db.rpc('insert_lead', {
      p_business_id:         businessId,
      p_company_name:        parsedInput.company_name,
      p_contact_name:        parsedInput.contact_name ?? null,
      p_contact_title:       parsedInput.contact_title ?? null,
      p_email:               parsedInput.email ?? null,
      p_phone:               parsedInput.phone ?? null,
      p_address:             parsedInput.address ?? null,
      p_monthly_budget:      parsedInput.monthly_budget ?? null,
      p_next_follow_up_date: parsedInput.next_follow_up_date ?? null,
      p_notes:               parsedInput.notes ?? null,
    })

    if (error) {
      console.error('[createLeadAction] DB 오류:', error)
      throw new Error('[APP] 거래처 추가에 실패했습니다')
    }
    revalidatePath('/dashboard/pipeline')
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

    if (error) throw new Error('[APP] 단계 변경에 실패했습니다')
    revalidatePath('/dashboard/pipeline')
    return { success: true }
  })

// 리드 수정
export const updateLeadAction = action
  .schema(updateLeadSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db.rpc('update_lead', {
      p_id:                  parsedInput.leadId,
      p_business_id:         businessId,
      p_company_name:        parsedInput.company_name,
      p_contact_name:        parsedInput.contact_name ?? null,
      p_contact_title:       parsedInput.contact_title ?? null,
      p_email:               parsedInput.email ?? null,
      p_phone:               parsedInput.phone ?? null,
      p_address:             parsedInput.address ?? null,
      p_monthly_budget:      parsedInput.monthly_budget ?? null,
      p_next_follow_up_date: parsedInput.next_follow_up_date ?? null,
      p_notes:               parsedInput.notes ?? null,
    })

    if (error) throw new Error('[APP] 수정에 실패했습니다')
    revalidatePath('/dashboard/pipeline')
    return { success: true }
  })

// 상담 기록 추가
export const createLeadActivityAction = action
  .schema(createActivitySchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db.from('lead_activities').insert({
      lead_id:     parsedInput.leadId,
      business_id: businessId,
      type:        parsedInput.type,
      content:     parsedInput.content,
      activity_at: parsedInput.activity_at ?? new Date().toISOString(),
    })

    if (error) throw new Error('[APP] 상담 기록 저장에 실패했습니다')
    revalidatePath('/dashboard/pipeline')
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
    revalidatePath('/dashboard/pipeline')
    return { success: true }
  })
