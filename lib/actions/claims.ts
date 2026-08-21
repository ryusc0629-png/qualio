'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getClaimBookingLabels } from '@/lib/utils/claim-booking'
import { sendPushToWorker } from '@/lib/push/web-push'
import { formatPhone } from '@/lib/format/phone'
import { marketDayRange, toMarketYmd } from '@/lib/format/datetime'
import { generateClaimReplies } from '@/lib/ai/claim-reply'
import { spendQuota } from '@/lib/ratelimit/daily-quota'
import type { SupabaseClient } from '@supabase/supabase-js'
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

// 클레임 담당자 지정/해제
const assignClaimSchema = z.object({
  claimId:  z.string().uuid(),
  workerId: z.string().uuid().nullable(),
})

export const assignClaimAction = action
  .schema(assignClaimSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('claims' as never)
      .update({ assigned_worker_id: parsedInput.workerId } as never)
      .eq('id' as never, parsedInput.claimId)
      .eq('business_id' as never, businessId)

    if (error) {
      console.error('[assignClaimAction] DB 오류:', error)
      throw new Error('[APP] 담당자 지정에 실패했어요. 다시 시도해주세요')
    }

    // 담당자가 지정되면 그 직원 폰(현장 앱)으로 처리 요청 푸시 — 발송 실패해도 지정은 유지
    if (parsedInput.workerId) {
      const { data: claim } = await db
        .from('claims' as never)
        .select('title, booking_id, customer_name, is_urgent' as never)
        .eq('id' as never, parsedInput.claimId)
        .eq('business_id' as never, businessId)
        .maybeSingle() as unknown as {
          data: { title: string; booking_id: string | null; customer_name: string; is_urgent: boolean } | null
        }

      if (claim) {
        await sendPushToWorker(parsedInput.workerId, {
          title: claim.is_urgent ? '🚨 긴급 클레임 처리 요청' : '클레임 처리 요청',
          body: `${claim.customer_name} · ${claim.title}`,
          url: claim.booking_id
            ? `/field/${parsedInput.workerId}/${claim.booking_id}`
            : `/field/${parsedInput.workerId}`,
          tag: `claim-${parsedInput.claimId}`,
        })
      }
    }

    revalidatePath('/dashboard/claims')
    revalidatePath('/dashboard/clients/[customerId]', 'page')
    return { success: true }
  })

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
      .select('id, title, content, is_urgent, status, resolution, created_at, resolved_at, booking_id, assigned_worker_id' as never)
      .eq('business_id' as never, businessId)
      .eq('customer_phone' as never, parsedInput.customerPhone)
      .order('is_urgent' as never, { ascending: false })
      .order('created_at' as never, { ascending: false }) as unknown as {
        data: {
          id: string; title: string; content: string | null; is_urgent: boolean
          status: string; resolution: string | null; created_at: string; resolved_at: string | null
          booking_id: string | null; assigned_worker_id: string | null
        }[] | null
      }

    const rows = data ?? []
    // 연결된 작업(서비스·날짜) 라벨 붙이기
    const labels = await getClaimBookingLabels(db, businessId, rows.map((r) => r.booking_id))
    const claims = rows.map((r) => ({
      ...r,
      relatedBooking: r.booking_id ? labels.get(r.booking_id) ?? null : null,
    }))

    // 담당자 선택용 활성 직원 목록
    const { data: workerRows } = await db
      .from('workers' as never)
      .select('id, name' as never)
      .eq('business_id' as never, businessId)
      .eq('is_active' as never, true)
      .order('name' as never) as unknown as { data: { id: string; name: string }[] | null }

    return { claims, workers: workerRows ?? [] }
  })

// 클레임 등록 스키마
const createClaimSchema = z.object({
  customer_name:  z.string().min(1, '고객 이름을 입력해주세요'),
  customer_phone: z.string().optional(),
  title:          z.string().min(1, '어떤 문제인지 한 줄로 적어주세요'),
  content:        z.string().optional(),
  is_urgent:      z.boolean().optional(),
  booking_id:     z.string().uuid().optional(), // 예약 상세에서 등록하면 그 작업과 연결
  // 어디가 문제인지 보여주는 사진 — 월간 보고서에 그대로 실린다
  photo_urls: z.array(z.string().min(1)).max(4).optional(),
})

export const createClaimAction = action
  .schema(createClaimSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 담당자를 또 고르게 하지 않는다 — 앞으로 잡힌 방문이 있으면 그 방문 담당자가 곧 담당자다.
    // (정기 거래처는 일정 배정에서 이미 정해져 있는데 클레임에서 다시 묻는 건 같은 걸 두 번 묻는 것)
    // 예정 방문이 없을 때만 '미정'으로 남고, 그때는 사장님이 고르면 된다.
    let bookingId = parsedInput.booking_id ?? null
    let assignedWorkerId: string | null = null

    if (parsedInput.customer_phone) {
      // 번호 형식이 두 가지로 섞여 저장돼 있어 그대로 비교하면 방문을 못 찾는다
      const digits = parsedInput.customer_phone.replace(/[^0-9]/g, '')
      const phoneVariants = [...new Set([parsedInput.customer_phone, digits, formatPhone(digits)])]

      // ⚠️ '앞으로 잡힌' 방문이어야 한다. 오늘 0시(KST)로 자르지 않으면 몇 주 전에 완료 처리를
      //    안 한 유령 예약이 가장 먼저 걸려서, 엉뚱한 사람에게 클레임이 배정된다.
      const todayStart = marketDayRange(toMarketYmd()).from

      const { data: nextVisit } = (await db
        .from('bookings')
        .select('id, worker_id')
        .eq('business_id', businessId)
        .in('customer_phone', phoneVariants)
        .in('status', ['confirmed', 'in_progress'])
        .gte('scheduled_at', todayStart)
        .is('deleted_at', null)
        .order('scheduled_at', { ascending: true })
        .limit(1)) as unknown as { data: { id: string; worker_id: string | null }[] | null }

      const visit = nextVisit?.[0]
      if (visit) {
        bookingId = bookingId ?? visit.id
        assignedWorkerId = visit.worker_id
      }
    }

    const { error } = await db.from('claims' as never).insert({
      business_id:    businessId,
      customer_name:  parsedInput.customer_name,
      customer_phone: parsedInput.customer_phone ?? null,
      title:          parsedInput.title,
      content:        parsedInput.content ?? null,
      is_urgent:      parsedInput.is_urgent ?? false,
      booking_id:     bookingId,
      assigned_worker_id: assignedWorkerId,
      photo_urls:     parsedInput.photo_urls ?? [],
      status:         'open',
    } as never)

    if (error) {
      console.error('[createClaimAction] DB 오류:', error)
      throw new Error('[APP] 클레임 등록에 실패했어요. 다시 시도해주세요')
    }

    // 다음 방문 담당자에게 바로 알린다. 현장 앱 작업 화면에도 뜨지만,
    // 이미 배정이 끝난 방문이면 직원이 그 화면을 다시 안 열 수도 있다.
    if (assignedWorkerId && bookingId) {
      await sendPushToWorker(assignedWorkerId, {
        title: parsedInput.is_urgent ? '🚨 긴급 클레임 처리 요청' : '고객 요청이 접수됐어요',
        body: `${parsedInput.customer_name} · ${parsedInput.title}`,
        url: `/field/${assignedWorkerId}/${bookingId}`,
        tag: 'claim-new',
      }).catch((e) => console.error('[createClaimAction] 푸시 실패:', e))
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
  // 처리 후 사진 — '요청 → 처리'가 눈으로 확인된다
  resolution_photo_urls: z.array(z.string().min(1)).max(4).optional(),
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
        resolution_photo_urls: parsedInput.resolution_photo_urls ?? [],
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

// 클레임 응대 문구 초안 생성 — 고객에게 보낼 3단계 응대(접수·조치·마무리) 초안
const claimRepliesSchema = z.object({
  claimId: z.string().uuid(),
})

export const generateClaimRepliesAction = action
  .schema(claimRepliesSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { data: claim } = (await db
      .from('claims' as never)
      .select('customer_name, title, content, is_urgent')
      .eq('id' as never, parsedInput.claimId)
      .eq('business_id' as never, businessId)
      .maybeSingle()) as unknown as {
      data: { customer_name: string; title: string; content: string | null; is_urgent: boolean } | null
    }
    if (!claim) throw new Error('[APP] 클레임을 찾을 수 없습니다')

    // 하루 한도 — 폭주해도 원가가 터지지 않게 하는 안전장치다(평소엔 닿지 않는 높이)
    await spendQuota(db as unknown as SupabaseClient, 'claim', businessId)

    const { data: business } = await db
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .maybeSingle()

    const replies = await generateClaimReplies({
      businessName: business?.name ?? '저희 업체',
      customerName: claim.customer_name,
      title: claim.title,
      content: claim.content,
      isUrgent: claim.is_urgent,
    })

    return { success: true, replies }
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
