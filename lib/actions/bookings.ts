'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendRescheduleAlimtalk } from '@/lib/kakao/alimtalk'
import { sendOnMyWayForBooking } from '@/lib/kakao/on-my-way'

// 한국 전화번호 검증
const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

// 수동 예약 추가 스키마 (사장님이 전화로 받은 예약)
const addBookingSchema = z.object({
  customer_name: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  customer_phone: z
    .string()
    .min(1, '연락처를 입력해주세요')
    .transform((val) => val.replace(/-/g, ''))
    .refine((val) => phoneRegex.test(val), '올바른 전화번호 형식이 아닙니다'),
  service_address: z.string().min(5, '주소를 입력해주세요'),
  cleaning_type: z.string().min(1, '서비스명을 입력해주세요'),
  scheduled_at: z.string().min(1, '예약 일시를 입력해주세요'),
  final_price: z.coerce.number().min(0, '0 이상의 금액을 입력해주세요'),
  memo: z.string().max(500).optional(),
})

// 예약 상태 변경 스키마
const VALID_STATUSES = ['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'] as const

const updateBookingStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.string().refine(
    (val): val is typeof VALID_STATUSES[number] => (VALID_STATUSES as readonly string[]).includes(val),
    '올바른 상태값이 아닙니다'
  ),
})

// 수동 예약 추가 액션 (사장님 전용)
export const addBookingAction = action
  .schema(addBookingSchema)
  .action(async ({ parsedInput }) => {
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

    const scheduledIso = new Date(parsedInput.scheduled_at).toISOString()

    // 중복 제출 방어 — 같은 고객·일시·금액의 예약이 이미 있으면 또 만들지 않음
    // (추가 직후 일정 화면에 안 보여 다시 누르는 경우 등으로 같은 예약이 2번 박히던 문제 방지)
    const { data: existingBooking } = await db
      .from('bookings')
      .select('id')
      .eq('business_id', profile.business_id)
      .eq('customer_phone', parsedInput.customer_phone)
      .eq('scheduled_at', scheduledIso)
      .eq('final_price', parsedInput.final_price)
      .is('deleted_at', null)
      .limit(1)

    if (existingBooking && existingBooking.length > 0) {
      // 이미 동일 예약 존재 — 중복 생성 없이 성공으로 처리
      revalidatePath('/dashboard/schedule')
      revalidatePath('/dashboard/bookings')
      revalidatePath('/dashboard/clients')
      return { success: true }
    }

    const { error } = await db.from('bookings').insert({
      business_id: profile.business_id,
      quote_id: null,
      customer_name: parsedInput.customer_name,
      customer_phone: parsedInput.customer_phone,
      service_address: parsedInput.service_address,
      scheduled_at: scheduledIso,
      selected_tier: 'good',
      final_price: parsedInput.final_price,
      memo: parsedInput.memo ?? null,
      status: 'confirmed',
    })

    if (error) throw new Error('[APP] 예약 추가에 실패했습니다')

    // 수동 예약 추가 시 고객 DB 자동 등록 (전화번호 기준, 이미 있으면 스킵)
    const { data: existing } = await db
      .from('customers')
      .select('id')
      .eq('business_id', profile.business_id)
      .eq('phone', parsedInput.customer_phone)
      .maybeSingle()

    if (!existing) {
      await db.from('customers').insert({
        business_id: profile.business_id,
        name: parsedInput.customer_name,
        phone: parsedInput.customer_phone,
        address: parsedInput.service_address ?? null,
        type: 'one_time',
      })
    }

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/bookings')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 검토 완료 처리 — 변동형 항목(에어컨 대수 등)을 통화로 확인하고 금액을 맞춘 뒤 호출
const clearBookingReviewSchema = z.object({ id: z.string().uuid() })

export const clearBookingReviewAction = action
  .schema(clearBookingReviewSchema)
  .action(async ({ parsedInput }) => {
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

    const { error } = await db
      .from('bookings')
      .update({ needs_review: false, review_reason: null } as never)
      .eq('id', parsedInput.id)
      .eq('business_id', profile.business_id)

    if (error) throw new Error('[APP] 검토 완료 처리에 실패했습니다')

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 기사 출발 알림 (대표가 예약 상세에서 발송) — 고객 수신 설정 확인 후 발송
export const sendOnMyWayAction = action
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
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

    const { data: booking } = await db
      .from('bookings')
      .select('id, customer_name, customer_phone, scheduled_at, quote_id')
      .eq('id', parsedInput.id)
      .eq('business_id', profile.business_id)
      .maybeSingle()
    if (!booking) throw new Error('[APP] 예약을 찾을 수 없습니다')

    const result = await sendOnMyWayForBooking(db as unknown as SupabaseClient, profile.business_id, booking)

    revalidatePath('/dashboard/schedule')
    return { success: true, sent: result.sent, skipped: result.skipped }
  })

// 예약 상태 변경 액션 (사장님 전용)
export const updateBookingStatusAction = action
  .schema(updateBookingStatusSchema)
  .action(async ({ parsedInput }) => {
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

    // 완료 처리 시 고객 정보 미리 조회 (upsert용)
    let bookingForCustomer: { customer_name: string; customer_phone: string | null; service_address: string | null } | null = null
    if (parsedInput.status === 'completed') {
      const { data } = await db
        .from('bookings')
        .select('customer_name, customer_phone, service_address')
        .eq('id', parsedInput.id)
        .eq('business_id', profile.business_id)
        .maybeSingle()
      bookingForCustomer = data
    }

    // 본인 업체 예약인지 확인 후 상태 업데이트
    const { error } = await db
      .from('bookings')
      .update({
        status: parsedInput.status,
        ...(parsedInput.status === 'cancelled' ? { cancelled_at: new Date().toISOString() } : {}),
      })
      .eq('id', parsedInput.id)
      .eq('business_id', profile.business_id)

    if (error) throw new Error('[APP] 상태 변경에 실패했습니다')

    // 청소 완료 → 고객 DB 자동 upsert (전화번호 기준, 이미 있으면 스킵)
    if (parsedInput.status === 'completed' && bookingForCustomer?.customer_phone?.trim()) {
      const { data: existing } = await db
        .from('customers')
        .select('id')
        .eq('business_id', profile.business_id)
        .eq('phone', bookingForCustomer.customer_phone)
        .maybeSingle()

      if (!existing) {
        await db.from('customers').insert({
          business_id: profile.business_id,
          name: bookingForCustomer.customer_name,
          phone: bookingForCustomer.customer_phone,
          address: bookingForCustomer.service_address ?? null,
          type: 'one_time',
        })
      }
    }

    revalidatePath('/dashboard/work')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 예약 일정 변경 액션 — DB 업데이트 + 고객 알림톡 자동 발송
const rescheduleBookingSchema = z.object({
  booking_id:       z.string().uuid(),
  new_scheduled_at: z.string().min(1, '새 날짜를 선택해주세요'),
})

export const rescheduleBookingAction = action
  .schema(rescheduleBookingSchema)
  .action(async ({ parsedInput }) => {
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

    // 현재 예약 조회 (변경 전 일시 + 고객 연락처 확보)
    const { data: booking } = await db
      .from('bookings')
      .select('id, customer_phone, scheduled_at, quote_id, status')
      .eq('id', parsedInput.booking_id)
      .eq('business_id', profile.business_id)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')
    if (['completed', 'cancelled', 'no_show'].includes(booking.status)) {
      throw new Error('[APP] 완료·취소된 예약은 일정을 변경할 수 없습니다')
    }

    const oldScheduledAt = booking.scheduled_at
    const newScheduledAt = new Date(parsedInput.new_scheduled_at).toISOString()

    // 일정 업데이트
    const { error } = await db
      .from('bookings')
      .update({ scheduled_at: newScheduledAt })
      .eq('id', parsedInput.booking_id)
      .eq('business_id', profile.business_id)

    if (error) throw new Error('[APP] 일정 변경에 실패했습니다')

    // 고객 알림톡 발송 (연락처 있는 경우만, 실패해도 변경은 유지)
    if (booking.customer_phone) {
      try {
        const { data: business } = await db
          .from('businesses')
          .select('name, phone')
          .eq('id', profile.business_id)
          .maybeSingle()

        // 서비스명 조회 (quote가 있으면 cleaning_type, 없으면 기본값)
        let cleaningType = '청소 서비스'
        if (booking.quote_id) {
          const { data: quote } = await db
            .from('quotes')
            .select('cleaning_type')
            .eq('id', booking.quote_id)
            .maybeSingle()
          if (quote?.cleaning_type) cleaningType = quote.cleaning_type
        }

        if (business) {
          await sendRescheduleAlimtalk({
            customerPhone:  booking.customer_phone,
            businessName:   business.name,
            businessPhone:  business.phone ?? null,
            cleaningType,
            oldScheduledAt,
            newScheduledAt,
          })
        }
      } catch (e) {
        console.error('[Alimtalk] 일정 변경 알림톡 발송 실패 — 일정 변경은 정상 완료됨', e)
      }
    }

    revalidatePath('/dashboard/work')
    return { success: true }
  })
