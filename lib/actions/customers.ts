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

    revalidatePath('/dashboard/clients')
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

    // 수정 전 옛 전화번호 확보 — 예약(bookings)은 customer_phone으로 연결돼 있어
    // 이름/번호를 바꾸면 옛 번호로 잡힌 기존 예약의 표시값도 함께 갱신해야 어긋나지 않음
    const { data: prev } = await db
      .from('customers')
      .select('phone')
      .eq('id', parsedInput.customerId)
      .eq('business_id', businessId)
      .maybeSingle()

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

    if (error) {
      console.error('[Customers] 고객 정보 수정 실패:', error)
      throw new Error('[APP] 고객 정보 수정에 실패했습니다')
    }

    // 옛 번호로 연결된 예약들의 이름·번호(비정규화 값)를 새 값으로 동기화
    if (prev?.phone) {
      const { error: bookingError } = await db
        .from('bookings')
        .update({
          customer_name: parsedInput.name,
          customer_phone: parsedInput.phone,
        })
        .eq('business_id', businessId)
        .eq('customer_phone', prev.phone)

      if (bookingError) {
        console.error('[Customers] 예약 고객정보 동기화 실패:', bookingError)
        throw new Error('[APP] 일정의 고객 정보를 갱신하지 못했어요. 다시 시도해주세요')
      }
    }

    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/work')
    revalidatePath('/dashboard/bookings')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 활성 고객 등록 — 고객유형별 분기
// 개인(one_time): 첫 작업 일정 입력 시 예약 생성 → 캘린더 노출
// 법인(recurring): 정기계약 입력 시 계약 생성
const createActiveCustomerSchema = z.object({
  name: z.string().min(1, '업체명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  address: z.string().optional(),
  category: z.string().optional(),
  type: z.string().refine((v) => ['recurring', 'one_time'].includes(v), '유효하지 않은 고객 유형입니다'),
  notes: z.string().optional(),
  // 개인 — 첫 작업 일정 (선택)
  scheduleJob: z.string().optional(), // 'true' | ''
  job_service: z.string().optional(),
  job_scheduled_at: z.string().optional(),
  job_price: z.string().optional(),
  // 첫 작업 항목별 견적 (선택) — 있으면 합계가 금액이 됨
  job_items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.coerce.number().int().min(1),
    unitPrice: z.coerce.number().int().min(0),
    amount: z.coerce.number().int().min(0).optional(), // 합산 금액 직접 수정 시 우선
    unit: z.string().optional(), // '정액' | '평당' | '개'
  })).optional(),
  // 법인 — 정기계약 (선택)
  hasContract: z.string().optional(), // 'true' | ''
  service_type: z.string().optional(),
  frequency: z.string().optional(),
  contract_price: z.string().optional(),
  start_date: z.string().optional(),
})

export const createActiveCustomerAction = action
  .schema(createActiveCustomerSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 1. 고객 등록
    const { data: customer, error: customerError } = await db
      .from('customers')
      .insert({
        business_id: businessId,
        name: parsedInput.name,
        phone: parsedInput.phone,
        address: parsedInput.address || null,
        category: parsedInput.category || null,
        type: parsedInput.type,
        notes: parsedInput.notes || null,
      })
      .select('id')
      .single()

    if (customerError || !customer) throw new Error('[APP] 고객 등록에 실패했습니다')

    // 2-a. 개인 고객 — 첫 작업 예약 생성 (선택) → 캘린더 노출
    if (parsedInput.type === 'one_time' && parsedInput.scheduleJob === 'true') {
      if (!parsedInput.job_scheduled_at) throw new Error('[APP] 작업 날짜·시간을 입력해주세요')

      // 항목별 견적이 있으면 합계가 금액 — 없으면 단일 금액 사용
      const jobItems = (parsedInput.job_items ?? []).filter((it) => it.name.trim())
      let price: number
      if (jobItems.length > 0) {
        price = jobItems.reduce((s, it) => s + (it.amount ?? it.quantity * it.unitPrice), 0)
      } else {
        if (!parsedInput.job_price) throw new Error('[APP] 작업 금액을 입력해주세요')
        price = parseInt(parsedInput.job_price, 10)
        if (isNaN(price) || price < 0) throw new Error('[APP] 올바른 작업 금액을 입력해주세요')
      }

      const { data: booking, error: bookingError } = await db.from('bookings').insert({
        business_id: businessId,
        quote_id: null,
        customer_name: parsedInput.name,
        customer_phone: parsedInput.phone,
        service_address: parsedInput.address || '',
        scheduled_at: new Date(parsedInput.job_scheduled_at).toISOString(),
        selected_tier: 'good',
        final_price: price,
        memo: parsedInput.job_service || null,
        status: 'confirmed',
      })
        .select('id')
        .single()

      if (bookingError || !booking) {
        console.error('[Customers] 작업 일정(booking) 등록 실패:', bookingError)
        throw new Error('[APP] 작업 일정 등록에 실패했습니다')
      }

      // 항목별 견적 저장
      if (jobItems.length > 0) {
        const { error: itemsError } = await db.from('booking_items' as never).insert(
          jobItems.map((it, idx) => ({
            business_id: businessId,
            booking_id: booking.id,
            name: it.name,
            quantity: it.quantity,
            unit_price: it.unitPrice,
            amount: it.amount ?? it.quantity * it.unitPrice,
            unit: it.unit ?? '개',
            sort_order: idx,
          })) as never,
        )
        if (itemsError) {
          console.error('[Customers] 작업 항목(booking_items) 저장 실패:', itemsError)
          throw new Error('[APP] 작업 항목 저장에 실패했습니다')
        }
      }
    }

    // 2-b. 법인 고객 — 정기계약 생성 (선택)
    if (parsedInput.type === 'recurring' && parsedInput.hasContract === 'true') {
      if (!parsedInput.service_type) throw new Error('[APP] 서비스 유형을 입력해주세요')
      if (!parsedInput.frequency) throw new Error('[APP] 방문 주기를 선택해주세요')
      if (!parsedInput.contract_price) throw new Error('[APP] 계약금액을 입력해주세요')
      if (!parsedInput.start_date) throw new Error('[APP] 시작일을 입력해주세요')

      const price = parseInt(parsedInput.contract_price, 10)
      if (isNaN(price) || price < 1) throw new Error('[APP] 올바른 계약금액을 입력해주세요')

      const { error: contractError } = await db.from('contracts').insert({
        business_id: businessId,
        customer_id: customer.id,
        service_type: parsedInput.service_type,
        frequency: parsedInput.frequency,
        contract_price: price,
        start_date: parsedInput.start_date,
      })

      if (contractError) {
        console.error('[Customers] 정기계약(contract) 등록 실패:', contractError)
        throw new Error('[APP] 계약 등록에 실패했습니다')
      }
    }

    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard/bookings')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 고객 + 계약 동시 등록 (CRM 계약완료 → 고객 전환용)
const createCustomerWithContractSchema = z.object({
  name: z.string().min(1, '고객명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  address: z.string().optional(),
  category: z.string().optional(),
  lead_id: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional(),
  // 계약 정보 (선택)
  hasContract: z.string().optional(), // 'true' or ''
  service_type: z.string().optional(),
  frequency: z.string().optional(),
  contract_price: z.string().optional(),
  start_date: z.string().optional(),
})

export const createCustomerWithContractAction = action
  .schema(createCustomerWithContractSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 1. 고객 등록
    const type = parsedInput.hasContract === 'true' ? 'recurring' : 'one_time'

    const { data: customer, error: customerError } = await db
      .from('customers')
      .insert({
        business_id: businessId,
        name: parsedInput.name,
        phone: parsedInput.phone,
        address: parsedInput.address || null,
        category: parsedInput.category || null,
        type,
        lead_id: parsedInput.lead_id || null,
        notes: parsedInput.notes || null,
      })
      .select('id')
      .single()

    if (customerError || !customer) throw new Error('[APP] 고객 등록에 실패했습니다')

    // 2. 계약 등록 (선택)
    if (parsedInput.hasContract === 'true') {
      if (!parsedInput.service_type) throw new Error('[APP] 서비스 유형을 입력해주세요')
      if (!parsedInput.frequency) throw new Error('[APP] 방문 주기를 선택해주세요')
      if (!parsedInput.contract_price) throw new Error('[APP] 계약금액을 입력해주세요')
      if (!parsedInput.start_date) throw new Error('[APP] 시작일을 입력해주세요')

      const price = parseInt(parsedInput.contract_price, 10)
      if (isNaN(price) || price < 1) throw new Error('[APP] 올바른 계약금액을 입력해주세요')

      const { error: contractError } = await db.from('contracts').insert({
        business_id: businessId,
        customer_id: customer.id,
        service_type: parsedInput.service_type,
        frequency: parsedInput.frequency,
        contract_price: price,
        start_date: parsedInput.start_date,
      })

      if (contractError) throw new Error('[APP] 계약 등록에 실패했습니다')
    }

    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 고객 삭제
const deleteCustomerSchema = z.object({
  customerId: z.string().uuid(),
})

export const deleteCustomerAction = action
  .schema(deleteCustomerSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 삭제 전 전화번호 확보 — 예약(bookings)은 customer_phone으로 연결돼 있어
    // 이 번호로 일정도 함께 정리해야 일정배정 화면과 데이터가 어긋나지 않음
    const { data: customer } = await db
      .from('customers')
      .select('phone')
      .eq('id', parsedInput.customerId)
      .eq('business_id', businessId)
      .maybeSingle()

    // 이 고객의 예약 일정을 소프트 삭제 → 일정배정/작업 화면에서 함께 사라짐
    if (customer?.phone) {
      const { error: bookingError } = await db
        .from('bookings')
        .update({ deleted_at: new Date().toISOString() })
        .eq('business_id', businessId)
        .eq('customer_phone', customer.phone)
        .is('deleted_at', null)

      if (bookingError) {
        console.error('[Customers] 고객 일정(bookings) 정리 실패:', bookingError)
        throw new Error('[APP] 고객의 일정을 정리하지 못했어요. 다시 시도해주세요')
      }
    }

    // 연결된 contracts는 ON DELETE CASCADE로 자동 삭제됨
    const { error } = await db
      .from('customers')
      .delete()
      .eq('id', parsedInput.customerId)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Customers] 고객 삭제 실패:', error)
      throw new Error('[APP] 삭제에 실패했습니다')
    }

    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/work')
    revalidatePath('/dashboard/bookings')
    revalidatePath('/dashboard')
    return { success: true }
  })
