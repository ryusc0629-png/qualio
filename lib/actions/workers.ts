'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getWorkerLimit, type PlanId } from '@/lib/config/plans'
import { isHoliday } from '@/lib/holidays/kr'
import { marketDayRange } from '@/lib/format/datetime'

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

// 구독 플랜 조회 — 구독 행이 없으면 베타로 본다(베타는 확장과 동일 대우)
async function getPlanId(
  db: Awaited<ReturnType<typeof getBusinessId>>['db'],
  businessId: string
): Promise<PlanId> {
  const { data } = (await db
    .from('subscriptions')
    .select('plan' as never)
    .eq('business_id', businessId)
    .maybeSingle()) as unknown as { data: { plan: string } | null }

  return (data?.plan as PlanId) ?? 'beta'
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

    // [축1] 플랜별 직원 수 제한 — 사람을 늘리면 요금도 같이 올라가는 구조
    const limit = getWorkerLimit(await getPlanId(db, businessId))
    if (limit !== null) {
      const { count } = await db
        .from('workers' as never)
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
      if ((count ?? 0) >= limit) {
        throw new Error(
          `[APP] 지금 요금제에서는 직원을 ${limit}명까지 등록할 수 있어요. 더 등록하시려면 요금제를 올려주세요`
        )
      }
    }

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

// KST(UTC+9) 기준 날짜는 보존하고 시각(HH:mm)만 교체한 UTC ISO 문자열을 만든다.
function replaceKstTime(iso: string, newTime: string): string {
  const kstOffset = 9 * 60 * 60 * 1000
  const kstDate = new Date(new Date(iso).getTime() + kstOffset)
  const dateStr = kstDate.toISOString().slice(0, 10)
  return new Date(`${dateStr}T${newTime}:00+09:00`).toISOString()
}

// 예약 시간 변경 (날짜 유지, 시간만 교체)
// applyToContract=true면, 이 예약이 속한 정기계약의 '앞으로의 모든 방문' 시각도 함께 바꾸고
// 계약 자체에도 기본 시각을 저장해 이후 자동 생성될 방문까지 같은 시간으로 깔리게 한다.
export const updateBookingTimeAction = action
  .schema(z.object({
    bookingId: z.string().uuid(),
    newTime:   z.string().regex(/^\d{2}:\d{2}$/, '시간 형식이 올바르지 않습니다'),
    applyToContract: z.boolean().optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { data: booking } = await db
      .from('bookings')
      .select('scheduled_at, status, contract_id' as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as {
        data: { scheduled_at: string; status: string; contract_id: string | null } | null
      }

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')
    if (['completed', 'cancelled', 'no_show'].includes(booking.status)) {
      throw new Error('[APP] 완료·취소된 예약은 변경할 수 없습니다')
    }

    const newScheduledAt = replaceKstTime(booking.scheduled_at, parsedInput.newTime)

    const { error } = await db
      .from('bookings')
      .update({ scheduled_at: newScheduledAt })
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 시간 변경에 실패했습니다')

    // 정기계약 전체에 적용 — 앞으로의 미완료 방문 시각을 일괄 교체
    const contractId = booking.contract_id
    let propagated = 0
    if (parsedInput.applyToContract && contractId) {
      // 이후 자동 생성될 방문도 같은 시각으로 깔리도록 계약에 기본 시각 저장
      await db
        .from('contracts')
        .update({ visit_time: parsedInput.newTime } as never)
        .eq('id', contractId)
        .eq('business_id', businessId)

      // '앞으로' = 오늘(KST) 0시 이후. 이미 지난·완료·취소 방문은 건드리지 않는다.
      const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
      const todayStartUtc = new Date(`${nowKST.toISOString().slice(0, 10)}T00:00:00+09:00`).toISOString()

      const { data: siblings } = await db
        .from('bookings')
        .select('id, scheduled_at')
        .eq('contract_id' as never, contractId)
        .eq('business_id', businessId)
        .in('status', ['confirmed', 'in_progress'])
        .gte('scheduled_at', todayStartUtc)
        .is('deleted_at', null) as unknown as {
          data: { id: string; scheduled_at: string }[] | null
        }

      for (const s of siblings ?? []) {
        const at = replaceKstTime(s.scheduled_at, parsedInput.newTime)
        const { error: sErr } = await db
          .from('bookings')
          .update({ scheduled_at: at })
          .eq('id', s.id)
          .eq('business_id', businessId)
        if (!sErr) propagated++
      }
    }

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/contracts')
    return { success: true, newScheduledAt, propagated, contractId }
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

// 취소(또는 노쇼)된 예약 다시 살리기 — 고객이 재예약했을 때 빠르게 복구
export const restoreBookingFromScheduleAction = action
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
    if (!['cancelled', 'no_show'].includes(booking.status as string)) {
      throw new Error('[APP] 취소된 예약만 다시 잡을 수 있어요')
    }

    const { error } = await db
      .from('bookings')
      .update({ status: 'confirmed', cancelled_at: null, cancellation_reason: null } as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 다시 예약 잡기에 실패했어요')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/work')
    return { success: true }
  })

// 잘못 넣은 일정 삭제 — 소프트 삭제(deleted_at)로 보드에서 완전히 사라짐
// 취소(status='cancelled')는 이력이 흐리게 남지만, 삭제는 실수로 넣은 일정을 목록에서 아예 치움
export const deleteBookingFromScheduleAction = action
  .schema(z.object({ bookingId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { data: booking } = await db
      .from('bookings')
      .select('id')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

    const { error } = await db
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 일정 삭제에 실패했어요')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/work')
    return { success: true }
  })

// 공휴일 하루치 정기 방문을 한 번에 치운다 — "그날 다 쉬었는데 일정엔 그대로 남아 있는" 상황용.
//
// 계약에 '공휴일엔 쉬어요'를 켜두면 앞으로의 일정은 애초에 안 깔리지만, 그 전에 이미
// 깔려 있던 방문은 남는다. 그걸 사장님이 캘린더에서 한 번에 지울 수 있게 한다.
// 아직 시작 안 한(confirmed) 정기 방문만 지운다 — 진행중·완료 방문은 실제로 일한 이력이라 보존.
export const clearHolidayVisitsAction = action
  .schema(z.object({ date: z.string().min(10).max(10) })) // 'YYYY-MM-DD' (KST)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    if (!isHoliday(parsedInput.date)) throw new Error('[APP] 공휴일이 아닌 날이에요')

    const { from, to } = marketDayRange(parsedInput.date)

    const { data: cleared, error } = await db
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('business_id', businessId)
      .eq('status', 'confirmed')
      .not('contract_id', 'is', null)
      .gte('scheduled_at', from)
      .lte('scheduled_at', to)
      .is('deleted_at', null)
      .select('id')

    if (error) throw new Error('[APP] 일정을 정리하지 못했어요. 다시 눌러주세요')

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/work')
    revalidatePath('/dashboard')
    return { success: true, clearedCount: cleared?.length ?? 0 }
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

    // newDate는 KST 달력 날짜. 표시되는 KST 시:분은 그대로 두고 날짜만 옮긴다.
    // (UTC 시:분을 그대로 쓰면 KST 날짜≠UTC 날짜인 예약이 하루 밀리는 버그가 생김)
    const prevTime = new Date(booking.scheduled_at)
    const kst = new Date(prevTime.getTime() + 9 * 60 * 60 * 1000) // KST로 환산
    const kstHours = kst.getUTCHours()
    const kstMinutes = kst.getUTCMinutes()
    const [year, month, day] = parsedInput.newDate.split('-').map(Number)
    // newDate(KST) + 기존 KST 시:분 → UTC(−9시간)로 저장
    const newScheduledAt = new Date(
      Date.UTC(year!, month! - 1, day!, kstHours, kstMinutes) - 9 * 60 * 60 * 1000
    ).toISOString()

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

// 거래처 전체 배정 — 드래그한 예약 1건의 날짜/담당자를 바꾸고,
// 같은 거래처(같은 전화번호)의 '앞으로 예정된' 일정 전부를 같은 담당자로 배정한다.
// 정기 청소는 한 담당자가 고정이므로, 정기계약에는 고정 담당자로도 저장해
// 앞으로 새로 생기는 방문이 자동으로 이 사람에게 배정되게 한다.
export const assignBookingAndPropagateAction = action
  .schema(z.object({
    bookingId: z.string().uuid(),
    workerId:  z.string().uuid(), // 전파 배정은 실제 담당자 지정만 (미배정 전파 없음)
    newDate:   z.string().min(10), // 드래그한 예약의 새 날짜 'YYYY-MM-DD'
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { data: booking } = await db
      .from('bookings')
      .select('scheduled_at, customer_phone, customer_id')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as {
        data: { scheduled_at: string; customer_phone: string | null; customer_id: string | null } | null
      }

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

    // 드래그한 예약의 날짜만 새 위치로 이동 (KST 시:분 보존, 하루 밀림 방지)
    const prevTime = new Date(booking.scheduled_at)
    const kst = new Date(prevTime.getTime() + 9 * 60 * 60 * 1000)
    const [year, month, day] = parsedInput.newDate.split('-').map(Number)
    const newScheduledAt = new Date(
      Date.UTC(year!, month! - 1, day!, kst.getUTCHours(), kst.getUTCMinutes()) - 9 * 60 * 60 * 1000
    ).toISOString()

    await db
      .from('bookings')
      .update({ worker_id: parsedInput.workerId, scheduled_at: newScheduledAt } as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    // 같은 거래처(전화번호)의 '앞으로 예정된' 일정 전부를 같은 담당자로 배정.
    // 앞으로 예정 = 아직 안 끝난 상태(confirmed/in_progress). 완료·취소·노쇼는 기록이라 건드리지 않음.
    const targetIds: string[] = [parsedInput.bookingId]
    if (booking.customer_phone) {
      const { data: siblings } = await db
        .from('bookings')
        .select('id')
        .eq('business_id', businessId)
        .eq('customer_phone', booking.customer_phone)
        .in('status', ['confirmed', 'in_progress'])
        .is('deleted_at' as never, null) as unknown as { data: { id: string }[] | null }

      for (const s of siblings ?? []) {
        if (!targetIds.includes(s.id)) targetIds.push(s.id)
      }

      if (targetIds.length > 1) {
        await db
          .from('bookings')
          .update({ worker_id: parsedInput.workerId } as never)
          .in('id', targetIds)
          .eq('business_id', businessId)
      }
    }

    // booking_workers 동기화 — 대상 예약 전부를 단일 담당자(팀장)로 교체
    await db.from('booking_workers' as never).delete().in('booking_id' as never, targetIds)
    await db.from('booking_workers' as never).insert(
      targetIds.map((id) => ({ booking_id: id, worker_id: parsedInput.workerId, is_lead: true })) as never
    )

    // 정기계약 고정 담당자 저장 — 이 거래처의 활성 계약에 담당자를 못박아
    // 앞으로 자동 생성되는 방문도 이 사람에게 배정되게 한다.
    if (booking.customer_id) {
      await db
        .from('contracts')
        .update({ default_worker_id: parsedInput.workerId } as never)
        .eq('customer_id', booking.customer_id)
        .eq('business_id', businessId)
        .eq('status', 'active')
    }

    revalidatePath('/dashboard/schedule')
    return { success: true, assignedCount: targetIds.length }
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
