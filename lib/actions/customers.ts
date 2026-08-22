'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import { generateVisitsForContract } from '@/lib/recurring/generate'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { inputToUtcIso } from '@/lib/format/datetime'
import { normalizePhone } from '@/lib/format/phone'
import { SALES_STAGE_VALUES } from '@/lib/business/sales-stage'
import { normalizeChannel } from '@/lib/utils/marketing-channels'

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

    // 같은 번호가 이미 명단에 있으면 만들지 않는다.
    // ⚠️운영 DB에서 같은 사람이 12초 간격으로 두 번 등록된 게 발견됐다('지인 김효진' 2행,
    //   한 행은 예약·계약 0으로 텅 빈 채 남음). 버튼은 isPending으로 잠겨 있으니 더블클릭이
    //   아니라, 등록한 뒤 목록에서 못 찾아 다시 등록한 경우다.
    //   ⛔'중복 확인' 버튼을 따로 만들지 말 것 — 시스템이 알아서 막는다.
    // ⚠️저장된 번호가 '010-1234-5678'과 '01012345678' 두 형식으로 섞여 있다(운영 DB 확인).
    //   그대로 비교하면 같은 사람인데 다른 사람으로 보여 중복을 놓친다 → 숫자만 남겨 비교한다.
    const phone = normalizePhone(parsedInput.phone)
    const { data: existing } = await db
      .from('customers')
      .select('id, name, phone')
      .eq('business_id', businessId)

    const dup = (existing ?? []).find((c) => normalizePhone(c.phone) === phone)
    if (dup) {
      throw new Error(`[APP] 이미 등록된 번호예요 — '${dup.name}'으로 명단에 있어요`)
    }

    const { error } = await db.from('customers').insert({
      business_id: businessId,
      name: parsedInput.name,
      phone,
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
  notify_on_my_way: z.boolean().optional(),
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
        phone: normalizePhone(parsedInput.phone),
        address: parsedInput.address || null,
        category: parsedInput.category || null,
        type: parsedInput.type,
        notes: parsedInput.notes || null,
        ...(parsedInput.notify_on_my_way !== undefined
          ? { notify_on_my_way: parsedInput.notify_on_my_way }
          : {}),
      } as never)
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
          customer_phone: normalizePhone(parsedInput.phone),
        })
        .eq('business_id', businessId)
        .eq('customer_phone', normalizePhone(prev.phone))

      if (bookingError) {
        console.error('[Customers] 예약 고객정보 동기화 실패:', bookingError)
        throw new Error('[APP] 일정의 고객 정보를 갱신하지 못했어요. 다시 시도해주세요')
      }

      // 클레임도 같은 번호로 연결돼 있어 함께 동기화 — 고객 상세 이력이 어긋나지 않게
      const { error: claimError } = await db
        .from('claims' as never)
        .update({ customer_name: parsedInput.name, customer_phone: normalizePhone(parsedInput.phone) } as never)
        .eq('business_id' as never, businessId)
        .eq('customer_phone' as never, normalizePhone(prev.phone))

      if (claimError) {
        console.error('[Customers] 클레임 고객정보 동기화 실패:', claimError)
        throw new Error('[APP] 클레임의 고객 정보를 갱신하지 못했어요. 다시 시도해주세요')
      }
    }

    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/work')
    revalidatePath('/dashboard/bookings')
    revalidatePath('/dashboard/claims')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 거래처 영업 상태 변경 — 자동 일회성/정기 배지와 별개로, 진행 중 영업 단계를 손으로 지정('' = 영업 없음)
const updateSalesStageSchema = z.object({
  customerId: z.string().uuid(),
  stage: z.string().refine(
    (v) => v === '' || (SALES_STAGE_VALUES as readonly string[]).includes(v),
    { message: '유효하지 않은 영업 상태입니다' },
  ),
})

export const updateCustomerSalesStageAction = action
  .schema(updateSalesStageSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('customers')
      .update({ sales_stage: parsedInput.stage || null })
      .eq('id', parsedInput.customerId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 영업 상태 변경에 실패했습니다')
    revalidatePath('/dashboard/clients')
    revalidatePath(`/dashboard/clients/${parsedInput.customerId}`)
    return { success: true }
  })

// 기사 출발 알림 수신 설정 토글 (고객별)
const setOnMyWaySchema = z.object({
  customerId: z.string().uuid(),
  enabled: z.boolean(),
})

export const setCustomerOnMyWayAction = action
  .schema(setOnMyWaySchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('customers')
      .update({ notify_on_my_way: parsedInput.enabled } as never)
      .eq('id', parsedInput.customerId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 설정 변경에 실패했습니다')

    revalidatePath(`/dashboard/clients/${parsedInput.customerId}`)
    return { success: true, enabled: parsedInput.enabled }
  })

// 활성 고객 등록 — 고객유형별 분기
// 개인/거래처 공통: 첫 작업 일정 입력 시 예약 생성 → 캘린더 노출 (일회성 작업)
// 거래처(recurring): 정기계약 입력 시 계약 생성 (첫 작업 예약과 별개, 동시 가능)
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
  // 유입경로('어떻게 알고 오셨어요?') — 첫 작업 예약에 채널로 남김
  channel: z.string().optional(),
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
        phone: normalizePhone(parsedInput.phone),
        address: parsedInput.address || null,
        category: parsedInput.category || null,
        type: parsedInput.type,
        notes: parsedInput.notes || null,
      })
      .select('id')
      .single()

    if (customerError || !customer) throw new Error('[APP] 고객 등록에 실패했습니다')

    // 2-a. 첫 작업 예약 생성 (선택) → 캘린더 노출 · 개인/거래처 모두 일회성 작업 가능
    if (parsedInput.scheduleJob === 'true') {
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
        customer_phone: normalizePhone(parsedInput.phone),
        service_address: parsedInput.address || '',
        // 폼 입력 시각을 KST 벽시계로 해석해 저장 (+09:00 붙은 값은 그대로 통과) — 9시간 밀림 방지
        scheduled_at: inputToUtcIso(parsedInput.job_scheduled_at),
        selected_tier: 'good',
        final_price: price,
        memo: parsedInput.job_service || null,
        status: 'confirmed',
        // 유입 채널 — 손으로 등록한 손님도 '어떻게 알고 오셨나'를 채널로 남겨 매출 귀속
        channel: normalizeChannel(parsedInput.channel),
      } as never)
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
        // 유입 채널 — 계약 매출을 채널에 귀속 (수기 '어떻게 알고 오셨어요?' 값)
        channel: normalizeChannel(parsedInput.channel),
      } as never)

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
  end_date: z.string().optional(), // 미입력=무기한
  contract_notes: z.string().optional(), // 계약 메모 (customers.notes와 구분)
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
        phone: normalizePhone(parsedInput.phone),
        address: parsedInput.address || null,
        category: parsedInput.category || null,
        type,
        lead_id: parsedInput.lead_id || null,
        notes: parsedInput.notes || null,
      })
      .select('id')
      .single()

    if (customerError || !customer) throw new Error('[APP] 고객 등록에 실패했습니다')

    // 1-2. 리드 시절 만든 견적서·시방서·계약서를 전환된 고객에게 그대로 연결
    // (이게 없으면 견적서는 lead_id에만 붙은 채 남고, 고객 상세는 customer_id로만
    //  조회하므로 "아직 만든 견적서가 없어요"로 보여 방어 자료가 유실된 것처럼 됨.
    //  lead_id는 지우지 않아 리드 이력에서도 계속 보이게 유지)
    if (parsedInput.lead_id) {
      const { error: relinkError } = await db
        .from('b2b_quotes')
        .update({ customer_id: customer.id } as never)
        .eq('lead_id', parsedInput.lead_id)
        .is('customer_id', null)
        .eq('business_id', businessId)
      if (relinkError) {
        // 고객 전환 자체는 성공시키되, 재연결 실패는 로그로 남겨 추적
        console.error('[Customers] 견적서 고객 재연결 실패 — 고객은 정상 전환됨', relinkError)
      }
    }

    // 2. 계약 등록 (선택)
    if (parsedInput.hasContract === 'true') {
      if (!parsedInput.service_type) throw new Error('[APP] 서비스 유형을 입력해주세요')
      if (!parsedInput.frequency) throw new Error('[APP] 방문 주기를 선택해주세요')
      if (!parsedInput.contract_price) throw new Error('[APP] 계약금액을 입력해주세요')
      if (!parsedInput.start_date) throw new Error('[APP] 시작일을 입력해주세요')

      const price = parseInt(parsedInput.contract_price, 10)
      if (isNaN(price) || price < 1) throw new Error('[APP] 올바른 계약금액을 입력해주세요')

      // 유입 채널 승계 — 리드에서 전환된 계약이면 리드가 처음 들어온 채널을 그대로 물려준다
      // (전환 화면엔 유입경로를 다시 묻지 않음 — 리드 시절 값이 곧 그 계약의 출처)
      let contractChannel: string | null = null
      if (parsedInput.lead_id) {
        const { data: lead } = await db
          .from('leads')
          .select('channel' as never)
          .eq('id', parsedInput.lead_id)
          .eq('business_id', businessId)
          .maybeSingle() as unknown as { data: { channel: string | null } | null }
        contractChannel = lead?.channel ?? null
      }

      // 기존 계약 등록(createContractAction)과 동일한 필드로 저장
      const { data: contract, error: contractError } = await db.from('contracts').insert({
        business_id: businessId,
        customer_id: customer.id,
        service_type: parsedInput.service_type,
        frequency: parsedInput.frequency,
        contract_price: price,
        start_date: parsedInput.start_date,
        end_date: parsedInput.end_date || null,
        notes: parsedInput.contract_notes || null,
        channel: contractChannel,
      } as never).select('id').single()

      if (contractError || !contract) throw new Error('[APP] 계약 등록에 실패했습니다')

      // 기존 계약 등록과 동일하게 향후 정기 방문을 일정에 자동 생성
      // (이게 없으면 계약만 생기고 일정에는 방문이 안 잡힘)
      try {
        await generateVisitsForContract(db as unknown as SupabaseClient, {
          id: contract.id,
          business_id: businessId,
          customer_id: customer.id,
          service_type: parsedInput.service_type,
          frequency: parsedInput.frequency,
          start_date: parsedInput.start_date,
          end_date: parsedInput.end_date || null,
          status: 'active',
          last_generated_until: null,
        })
      } catch (e) {
        console.error('[Customers] 정기 방문 자동 생성 실패 — 계약은 정상 등록됨', e)
        // 방문이 안 깔렸는데 조용히 넘어가면 매출 손실 → 대표폰에 즉시 알림
        try {
          await sendPushToBusiness(businessId, {
            title: '정기 방문 일정을 자동으로 못 만들었어요',
            body: '계약은 등록됐지만 방문 일정이 비어 있어요. 일정에서 방문을 직접 추가해주세요.',
            url: '/dashboard/contracts',
            tag: 'visit-gen-failed',
          })
        } catch (pushErr) {
          console.error('[Customers] 방문 생성 실패 알림 발송 실패:', pushErr)
        }
      }
    }

    // 기존 계약 등록과 동일한 화면들을 함께 갱신
    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard/customers')
    revalidatePath('/dashboard/contracts')
    revalidatePath('/dashboard/schedule')
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
        .eq('customer_phone', normalizePhone(customer.phone))
        .is('deleted_at', null)

      if (bookingError) {
        console.error('[Customers] 고객 일정(bookings) 정리 실패:', bookingError)
        throw new Error('[APP] 고객의 일정을 정리하지 못했어요. 다시 시도해주세요')
      }

      // 이 고객의 클레임도 함께 정리 — 삭제된 고객의 클레임이 떠돌지 않게
      const { error: claimError } = await db
        .from('claims' as never)
        .delete()
        .eq('business_id' as never, businessId)
        .eq('customer_phone' as never, normalizePhone(customer.phone))

      if (claimError) {
        console.error('[Customers] 고객 클레임 정리 실패:', claimError)
        throw new Error('[APP] 고객의 클레임을 정리하지 못했어요. 다시 시도해주세요')
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
    revalidatePath('/dashboard/claims')
    revalidatePath('/dashboard')
    return { success: true }
  })
