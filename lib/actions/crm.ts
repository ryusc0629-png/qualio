'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizeChannel } from '@/lib/utils/marketing-channels'

const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'quoted', 'negotiating', 'contracted', 'rejected', 'archived'] as const
const ACTIVITY_TYPES = ['call', 'visit', 'quote', 'note', 'meeting'] as const

// 고객 구분 값 (company=거래처, individual=일반)
const CUSTOMER_TYPES = ['company', 'individual'] as const

// 잠재고객 추가 스키마
const createLeadSchema = z.object({
  company_name: z.string().min(1, '이름 또는 업체명을 입력해주세요'),
  customer_type: z.string().refine((v) => CUSTOMER_TYPES.includes(v as typeof CUSTOMER_TYPES[number]), '유효하지 않은 고객 구분입니다').optional(),
  contact_name: z.string().optional(),
  contact_title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  monthly_budget: z.number().optional(),
  next_follow_up_date: z.string().optional(),
  notes: z.string().optional(),
  // 유입경로('어떻게 알고 오셨어요?') — 전화·소개 등 오프라인 유입을 채널에 편입
  channel: z.string().max(50).optional(),
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
  customer_type: z.string().refine((v) => CUSTOMER_TYPES.includes(v as typeof CUSTOMER_TYPES[number]), '유효하지 않은 고객 구분입니다').optional(),
  contact_name: z.string().optional(),
  contact_title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  monthly_budget: z.number().optional(),
  next_follow_up_date: z.string().optional(),
  notes: z.string().optional(),
})

// 상담 기록 추가 스키마
const createActivitySchema = z.object({
  leadId: z.string().uuid(),
  type: z.string().refine((v) => ACTIVITY_TYPES.includes(v as typeof ACTIVITY_TYPES[number]), '유효하지 않은 유형입니다'),
  content: z.string().min(1, '내용을 입력해주세요'),
  transcript: z.string().optional(), // 미팅 녹음 받아쓴 원문
  photos: z.array(z.string()).optional(), // 현장 사진 URL 목록(페이지 안 카메라로 촬영)
  activity_at: z.string().optional(),
})

// 삭제 스키마
const deleteLeadSchema = z.object({
  leadId: z.string().uuid(),
})

// 상담 기록 삭제 스키마
const deleteActivitySchema = z.object({
  activityId: z.string().uuid(),
})

// 상담 기록 수정 스키마 — 미팅 내용(정리/메모)·사진·날짜를 나중에 고칠 수 있게
// (미팅 녹음 화면은 이 액션으로 자동 저장하므로 사진·날짜도 함께 받는다)
const updateActivitySchema = z.object({
  activityId: z.string().uuid(),
  content: z.string(),
  transcript: z.string().optional(),
  photos: z.array(z.string()).optional(),
  activity_at: z.string().optional(),
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
      business_id:         businessId,
      company_name:        parsedInput.company_name,
      customer_type:       parsedInput.customer_type ?? 'company',
      contact_name:        parsedInput.contact_name ?? null,
      contact_title:       parsedInput.contact_title ?? null,
      email:               parsedInput.email ?? null,
      phone:               parsedInput.phone ?? null,
      address:             parsedInput.address ?? null,
      category:            parsedInput.category || null,
      monthly_budget:      parsedInput.monthly_budget ?? null,
      // 빈 문자열('')이 date 컬럼에 들어가면 22007 오류 → 빈 값은 반드시 null 로
      next_follow_up_date: parsedInput.next_follow_up_date || null,
      notes:               parsedInput.notes ?? null,
      // 유입 채널 — 알려진 채널 키만 저장(임의값은 null)
      channel:             normalizeChannel(parsedInput.channel),
    } as never)

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
        company_name:        parsedInput.company_name,
        customer_type:       parsedInput.customer_type ?? 'company',
        contact_name:        parsedInput.contact_name ?? null,
        contact_title:       parsedInput.contact_title ?? null,
        email:               parsedInput.email ?? null,
        phone:               parsedInput.phone ?? null,
        address:             parsedInput.address ?? null,
        category:            parsedInput.category || null,
        monthly_budget:      parsedInput.monthly_budget ?? null,
        // 빈 문자열('')이 date 컬럼에 들어가면 22007 오류 → 빈 값은 반드시 null 로
        next_follow_up_date: parsedInput.next_follow_up_date || null,
        notes:               parsedInput.notes ?? null,
      })
      .eq('id', parsedInput.leadId)
      .eq('business_id', businessId)

    if (error) {
      console.error('[updateLeadAction] DB 오류:', error)
      throw new Error('[APP] 수정에 실패했습니다')
    }
    revalidatePath('/dashboard/pipeline')
    return { success: true }
  })

// 후속 연락 미루기 — 다음 연락 예정일만 변경 (대시보드 '연락할 거래처'용)
const snoozeFollowUpSchema = z.object({
  leadId: z.string().uuid(),
  date: z.string().refine(
    (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    '날짜 형식이 올바르지 않습니다',
  ),
})

export const snoozeFollowUpAction = action
  .schema(snoozeFollowUpSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('leads')
      .update({ next_follow_up_date: parsedInput.date })
      .eq('id', parsedInput.leadId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 미루기에 실패했습니다')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/pipeline')
    return { success: true }
  })

// 상담 기록 추가
export const createLeadActivityAction = action
  .schema(createActivitySchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 저장된 기록의 id를 돌려준다 — 미팅 녹음 화면이 이 id로 이어서 자동 저장(수정)한다
    const { data, error } = await db
      .from('lead_activities')
      .insert({
        lead_id:     parsedInput.leadId,
        business_id: businessId,
        type:        parsedInput.type,
        content:     parsedInput.content,
        transcript:  parsedInput.transcript ?? null,
        photos:      (parsedInput.photos ?? []) as never, // database.ts 타입 미반영 → 단언
        activity_at: parsedInput.activity_at ?? new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error || !data) throw new Error('[APP] 상담 기록 저장에 실패했습니다')
    revalidatePath('/dashboard/pipeline')
    return { success: true, activityId: data.id }
  })

// 상담 기록 삭제 — 잘못 추가했거나 녹음 정리가 틀렸을 때 지운다(내 업체 것만)
export const deleteLeadActivityAction = action
  .schema(deleteActivitySchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('lead_activities')
      .delete()
      .eq('id', parsedInput.activityId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 상담 기록 삭제에 실패했습니다')
    revalidatePath('/dashboard/pipeline')
    return { success: true }
  })

// 상담 기록 내용 수정 — 미팅 정리/메모를 나중에 바로잡을 수 있게(내 업체 것만)
export const updateLeadActivityAction = action
  .schema(updateActivitySchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 넘어온 항목만 갱신 — 내용만 고치는 화면에서 사진·날짜가 지워지지 않게
    const patch: Record<string, unknown> = { content: parsedInput.content }
    if (parsedInput.transcript !== undefined) patch.transcript = parsedInput.transcript
    if (parsedInput.photos !== undefined) patch.photos = parsedInput.photos
    if (parsedInput.activity_at !== undefined) patch.activity_at = parsedInput.activity_at

    const { error } = await db
      .from('lead_activities')
      .update(patch as never)
      .eq('id', parsedInput.activityId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 상담 기록 수정에 실패했습니다')
    revalidatePath('/dashboard/pipeline')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 삭제
export const deleteLeadAction = action
  .schema(deleteLeadSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 견적서가 딸린 거래처는 지우지 않는다.
    // leads를 지워도 b2b_quotes는 lead_id만 null이 되어 남는데(FK가 SET NULL),
    // 그러면 화면 어디에서도 열 수 없는 문서가 되어 사장님 눈엔 '견적서가 사라진' 셈이 된다.
    const { count: quoteCount } = await db
      .from('b2b_quotes')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', parsedInput.leadId)
      .eq('business_id', businessId)

    if (quoteCount && quoteCount > 0) {
      throw new Error('[APP] 견적서가 있는 거래처는 삭제할 수 없어요. 견적서를 먼저 지우거나 보관하기를 눌러주세요')
    }

    const { error } = await db
      .from('leads')
      .delete()
      .eq('id', parsedInput.leadId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 삭제에 실패했습니다')
    revalidatePath('/dashboard/pipeline')
    return { success: true }
  })
