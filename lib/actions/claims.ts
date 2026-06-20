'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getClaimBookingLabels } from '@/lib/utils/claim-booking'
import { revalidatePath } from 'next/cache'

// 인증 + business_id 조회 헬퍼 (crm.ts와 동일 패턴)
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

// 특정 고객(전화번호)의 클레임 목록 조회 — 예약 상세에서 모달로 현황 확인용
const getClaimsByPhoneSchema = z.object({
  customerPhone: z.string().min(1),
})

export const getClaimsByPhoneAction = action
  .schema(getClaimsByPhoneSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { data } = await db
      .from('claims' as never)
      .select('id, title, content, is_urgent, status, resolution, created_at, resolved_at, booking_id' as never)
      .eq('business_id' as never, businessId)
      .eq('customer_phone' as never, parsedInput.customerPhone)
      .order('is_urgent' as never, { ascending: false })
      .order('created_at' as never, { ascending: false }) as unknown as {
        data: {
          id: string; title: string; content: string | null; is_urgent: boolean
          status: string; resolution: string | null; created_at: string; resolved_at: string | null
          booking_id: string | null
        }[] | null
      }

    const rows = data ?? []
    // 연결된 작업(서비스·날짜) 라벨 붙이기
    const labels = await getClaimBookingLabels(db, businessId, rows.map((r) => r.booking_id))
    const claims = rows.map((r) => ({
      ...r,
      relatedBooking: r.booking_id ? labels.get(r.booking_id) ?? null : null,
    }))

    return { claims }
  })

// 클레임 등록 스키마
const createClaimSchema = z.object({
  customer_name:  z.string().min(1, '고객 이름을 입력해주세요'),
  customer_phone: z.string().optional(),
  title:          z.string().min(1, '어떤 문제인지 한 줄로 적어주세요'),
  content:        z.string().optional(),
  is_urgent:      z.boolean().optional(),
  booking_id:     z.string().uuid().optional(), // 예약 상세에서 등록하면 그 작업과 연결
})

export const createClaimAction = action
  .schema(createClaimSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db.from('claims' as never).insert({
      business_id:    businessId,
      customer_name:  parsedInput.customer_name,
      customer_phone: parsedInput.customer_phone ?? null,
      title:          parsedInput.title,
      content:        parsedInput.content ?? null,
      is_urgent:      parsedInput.is_urgent ?? false,
      booking_id:     parsedInput.booking_id ?? null,
      status:         'open',
    } as never)

    if (error) {
      console.error('[createClaimAction] DB 오류:', error)
      throw new Error('[APP] 클레임 등록에 실패했어요. 다시 시도해주세요')
    }
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/claims')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/clients/[customerId]', 'page')
    return { success: true }
  })

// 클레임 해결 처리 스키마
const resolveClaimSchema = z.object({
  claimId:    z.string().uuid(),
  resolution: z.string().optional(),
})

export const resolveClaimAction = action
  .schema(resolveClaimSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('claims' as never)
      .update({
        status:      'resolved',
        resolution:  parsedInput.resolution ?? null,
        resolved_at: new Date().toISOString(),
      } as never)
      .eq('id' as never, parsedInput.claimId)
      .eq('business_id' as never, businessId)

    if (error) {
      console.error('[resolveClaimAction] DB 오류:', error)
      throw new Error('[APP] 해결 처리에 실패했어요. 다시 시도해주세요')
    }
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/claims')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/clients/[customerId]', 'page')
    return { success: true }
  })

// 다시 열기(미해결로 되돌리기) 스키마
const reopenClaimSchema = z.object({
  claimId: z.string().uuid(),
})

export const reopenClaimAction = action
  .schema(reopenClaimSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('claims' as never)
      .update({ status: 'open', resolved_at: null } as never)
      .eq('id' as never, parsedInput.claimId)
      .eq('business_id' as never, businessId)

    if (error) {
      console.error('[reopenClaimAction] DB 오류:', error)
      throw new Error('[APP] 다시 열기에 실패했어요. 다시 시도해주세요')
    }
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/claims')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/clients/[customerId]', 'page')
    return { success: true }
  })

// 삭제 스키마
const deleteClaimSchema = z.object({
  claimId: z.string().uuid(),
})

export const deleteClaimAction = action
  .schema(deleteClaimSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('claims' as never)
      .delete()
      .eq('id' as never, parsedInput.claimId)
      .eq('business_id' as never, businessId)

    if (error) {
      console.error('[deleteClaimAction] DB 오류:', error)
      throw new Error('[APP] 삭제에 실패했어요. 다시 시도해주세요')
    }
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/claims')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/clients/[customerId]', 'page')
    return { success: true }
  })
