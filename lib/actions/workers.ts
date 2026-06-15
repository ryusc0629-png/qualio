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
    const newScheduledAt = new Date(Date.UTC(
      current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(),
      hours!, minutes!,
    )).toISOString()

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
  .schema(z.object({ bookingId: z.string().uuid() }))
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
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() } as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 예약 취소에 실패했습니다')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/work')
    return { success: true }
  })

// 예약 드래그앤드롭 — 날짜 + 작업자 동시 변경
export const assignBookingAction = action
  .schema(z.object({
    bookingId: z.string().uuid(),
    workerId:  z.string().uuid().nullable(), // null = 미배정
    newDate:   z.string().min(10),           // 'YYYY-MM-DD' 형식
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    // 현재 예약 조회 (시간 보존용)
    const { data: booking } = await db
      .from('bookings')
      .select('scheduled_at')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

    // 기존 시간(HH:MM) 보존 + 날짜만 교체
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
    revalidatePath('/dashboard/schedule')
    return { success: true }
  })
