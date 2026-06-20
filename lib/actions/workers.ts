'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getBusinessId() {
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

// 직원/도급사 추가
export const addWorkerAction = action
  .schema(z.object({
    name:  z.string().min(1, '이름을 입력해주세요').max(20),
    phone: z.string().optional(),
    type:  z.string().refine((v) => ['employee', 'contractor'].includes(v), '유형을 선택해주세요'),
    color: z.string().min(4).max(7),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db.from('workers' as never).insert({
      business_id: businessId,
      name:        parsedInput.name,
      phone:       parsedInput.phone || null,
      type:        parsedInput.type,
      color:       parsedInput.color,
    } as never)

    if (error) throw new Error('[APP] 등록에 실패했습니다')
    revalidatePath('/dashboard/schedule')
    return { success: true }
  })

// 직원/도급사 삭제
export const deleteWorkerAction = action
  .schema(z.object({ workerId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    // 배정된 예약의 worker_id를 null로 초기화
    await db
      .from('bookings')
      .update({ worker_id: null } as never)
      .eq('worker_id' as never, parsedInput.workerId)
      .eq('business_id', businessId)

    const { error } = await db
      .from('workers' as never)
      .delete()
      .eq('id' as never, parsedInput.workerId)
      .eq('business_id' as never, businessId)

    if (error) throw new Error('[APP] 삭제에 실패했습니다')
    revalidatePath('/dashboard/schedule')
    return { success: true }
  })

// 예약 시간 변경 (날짜 유지, 시간만 교체)
export const updateBookingTimeAction = action
  .schema(z.object({
    bookingId: z.string().uuid(),
    newTime:   z.string().regex(/^\d{2}:\d{2}$/, '시간 형식이 올바르지 않습니다'),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { data: booking } = await db
      .from('bookings')
      .select('scheduled_at, status')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')
    if (['completed', 'cancelled', 'no_show'].includes(booking.status as string)) {
      throw new Error('[APP] 완료·취소된 예약은 변경할 수 없습니다')
    }

    const current = new Date(booking.scheduled_at as string)
    const [hours, minutes] = parsedInput.newTime.split(':').map(Number)
    // KST(UTC+9) 기준 날짜를 보존하고 시간만 교체
    const kstOffset = 9 * 60 * 60 * 1000
    const kstDate = new Date(current.getTime() + kstOffset)
    const dateStr = kstDate.toISOString().slice(0, 10)
    const newScheduledAt = new Date(
      `${dateStr}T${String(hours!).padStart(2, '0')}:${String(minutes!).padStart(2, '0')}:00+09:00`
    ).toISOString()

    const { error } = await db
      .from('bookings')
      .update({ scheduled_at: newScheduledAt })
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 시간 변경에 실패했습니다')
    revalidatePath('/dashboard/schedule')
    return { success: true, newScheduledAt }
  })

// 일정 보드에서 예약 취소
export const cancelBookingFromScheduleAction = action
  .schema(z.object({
    bookingId: z.string().uuid(),
    reason: z.string().max(300).optional(), // 취소 사유(선택) — 고객 이력에 함께 표시
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { data: booking } = await db
      .from('bookings')
      .select('status')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')
    if (['completed', 'cancelled', 'no_show'].includes(booking.status as string)) {
      throw new Error('[APP] 이미 완료·취소된 예약입니다')
    }

    const { error } = await db
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: parsedInput.reason?.trim() || null,
      } as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 예약 취소에 실패했습니다')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/work')
    return { success: true }
  })

// 예약 드래그앤드롭 — 날짜 + 담당자(단일) 동시 변경
// 드래그로 배정하면 해당 담당자 1명으로 교체됨 (다중 배정은 상세 시트에서)
export const assignBookingAction = action
  .schema(z.object({
    bookingId: z.string().uuid(),
    workerId:  z.string().uuid().nullable(), // null = 미배정
    newDate:   z.string().min(10),           // 'YYYY-MM-DD' 형식
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { data: booking } = await db
      .from('bookings')
      .select('scheduled_at')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

    const prevTime = new Date(booking.scheduled_at)
    const [year, month, day] = parsedInput.newDate.split('-').map(Number)
    const newScheduledAt = new Date(Date.UTC(
      year!, month! - 1, day!,
      prevTime.getUTCHours(),
      prevTime.getUTCMinutes(),
    )).toISOString()

    const { error } = await db
      .from('bookings')
      .update({
        worker_id:    parsedInput.workerId,
        scheduled_at: newScheduledAt,
      } as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 저장에 실패했습니다')

    // booking_workers 동기화 — 드래그 배정은 단일 담당자로 교체
    await db.from('booking_workers' as never).delete().eq('booking_id' as never, parsedInput.bookingId)
    if (parsedInput.workerId) {
      await db.from('booking_workers' as never).insert({
        booking_id: parsedInput.bookingId,
        worker_id:  parsedInput.workerId,
        is_lead:    true,
      } as never)
    }

    revalidatePath('/dashboard/schedule')
    return { success: true }
  })

// 다중 팀원 배정 — 상세 시트에서 여러 직원을 한 예약에 배정
export const updateBookingWorkersAction = action
  .schema(z.object({
    bookingId: z.string().uuid(),
    workerIds: z.array(z.string().uuid()), // 순서 유지 — 첫 번째가 팀장
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { data: booking } = await db
      .from('bookings')
      .select('id')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

    // 기존 배정 전체 삭제 후 새 배정 삽입
    await db.from('booking_workers' as never).delete().eq('booking_id' as never, parsedInput.bookingId)

    if (parsedInput.workerIds.length > 0) {
      await db.from('booking_workers' as never).insert(
        parsedInput.workerIds.map((wId, idx) => ({
          booking_id: parsedInput.bookingId,
          worker_id:  wId,
          is_lead:    idx === 0,
        })) as never
      )
    }

    // bookings.worker_id = 팀장(첫 번째) 유지 (현장 앱 호환)
    await db
      .from('bookings')
      .update({ worker_id: parsedInput.workerIds[0] ?? null } as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    revalidatePath('/dashboard/schedule')
    return { success: true }
  })

// 예약 상태 변경 (일정 보드에서 직접 처리)
export const updateBookingStatusAction = action
  .schema(z.object({
    bookingId: z.string().uuid(),
    status: z.string().refine(
      (v) => ['confirmed', 'in_progress', 'completed', 'no_show'].includes(v),
      { message: '유효하지 않은 상태값입니다' }
    ),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { data: booking } = await db
      .from('bookings')
      .select('status')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

    // 상태 전이 규칙
    const allowed: Record<string, string[]> = {
      confirmed:   ['in_progress', 'no_show'],
      in_progress: ['completed', 'confirmed'],
      completed:   ['in_progress'],
    }

    if (!allowed[booking.status]?.includes(parsedInput.status)) {
      throw new Error('[APP] 현재 상태에서 변경할 수 없어요')
    }

    const { error } = await db
      .from('bookings')
      .update({ status: parsedInput.status })
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 상태 변경에 실패했어요')
    revalidatePath('/dashboard/schedule')
    return { success: true, newStatus: parsedInput.status }
  })
