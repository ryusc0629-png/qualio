'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import { generateVisitsForContract } from '@/lib/recurring/generate'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { normalizeChannel } from '@/lib/utils/marketing-channels'

// 정기방문 자동생성이 실패하면(예약이 안 깔림) 대표폰에 즉시 알림 — 조용히 넘어가면 방문 누락=매출 손실
async function notifyVisitGenFailed(businessId: string) {
  try {
    await sendPushToBusiness(businessId, {
      title: '정기 방문 일정을 자동으로 못 만들었어요',
      body: '계약은 등록됐지만 방문 일정이 비어 있어요. 일정에서 방문을 직접 추가해주세요.',
      url: '/dashboard/contracts',
      tag: 'visit-gen-failed',
    })
  } catch (e) {
    console.error('[Contracts] 방문 생성 실패 알림 발송 실패:', e)
  }
}

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

// 정기계약 등록
const createContractSchema = z.object({
  customer_id: z.string().uuid('고객을 선택해주세요'),
  service_type: z.string().min(1, '서비스 유형을 입력해주세요'),
  frequency: z.string().min(1, '방문 주기를 입력해주세요'),
  contract_price: z.coerce.number().min(1, '계약금액을 입력해주세요'),
  start_date: z.string().min(1, '시작일을 입력해주세요'),
  end_date: z.string().optional(),
  notes: z.string().optional(),
  // 유입경로('어떻게 알고 오셨어요?') — 계약 매출을 채널에 귀속
  channel: z.string().max(50).optional(),
})

export const createContractAction = action
  .schema(createContractSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 해당 고객이 이 business 소속인지 확인
    const { data: customer } = await db
      .from('customers')
      .select('id')
      .eq('id', parsedInput.customer_id)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!customer) throw new Error('[APP] 유효하지 않은 고객입니다')

    const { data: contract, error } = await db.from('contracts').insert({
      business_id: businessId,
      customer_id: parsedInput.customer_id,
      service_type: parsedInput.service_type,
      frequency: parsedInput.frequency,
      contract_price: parsedInput.contract_price,
      start_date: parsedInput.start_date,
      end_date: parsedInput.end_date || null,
      notes: parsedInput.notes || null,
      // 유입 채널 — 계약 매출을 채널에 귀속
      channel: normalizeChannel(parsedInput.channel),
    } as never).select('id').single()

    if (error || !contract) throw new Error('[APP] 계약 등록에 실패했습니다')

    // 해당 고객 type을 recurring으로 변경
    await db
      .from('customers')
      .update({ type: 'recurring' })
      .eq('id', parsedInput.customer_id)
      .eq('business_id', businessId)

    // 등록 즉시 향후 방문을 일정에 자동 생성 (사장님이 바로 확인 가능)
    try {
      await generateVisitsForContract(db as unknown as SupabaseClient, {
        id: contract.id,
        business_id: businessId,
        customer_id: parsedInput.customer_id,
        service_type: parsedInput.service_type,
        frequency: parsedInput.frequency,
        start_date: parsedInput.start_date,
        end_date: parsedInput.end_date || null,
        status: 'active',
        last_generated_until: null,
      })
    } catch (e) {
      console.error('[Contracts] 정기 방문 자동 생성 실패 — 계약은 정상 등록됨', e)
      await notifyVisitGenFailed(businessId)
    }

    revalidatePath('/dashboard/contracts')
    revalidatePath('/dashboard/customers')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 계약 내용 수정 — 범위(계약 이름)·주기·월 금액·기간·메모
//
// 실무에서 가장 잦은 변경이 "작업 범위가 늘어 월 금액이 오른다"인데, contract_price를 그냥
// 덮어쓰면 과거 매출까지 새 금액으로 소급된다. 그래서 금액이 바뀌면 price_history에
// "언제부터 얼마" 구간을 남기고, 누적 매출은 lib/utils/ltv.ts가 구간별로 계산한다.
const updateContractSchema = z.object({
  contractId: z.string().uuid(),
  service_type: z.string().min(1, '계약 이름을 입력해주세요').max(100),
  frequency: z.string().min(1, '방문 주기를 선택해주세요'),
  contract_price: z.coerce.number().min(1, '월 금액을 입력해주세요'),
  // 아래 둘은 금액이 실제로 바뀔 때만 쓰인다
  price_effective_from: z.string().optional(), // 새 금액 적용 시작일 (미입력 = 오늘)
  price_change_note: z.string().max(200).optional(), // 왜 바뀌었는지 (예: '진료센터 추가')
  start_date: z.string().min(1, '시작일을 입력해주세요'),
  end_date: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

interface ContractPriceSegment {
  from: string
  price: number
  note?: string | null
}

export const updateContractAction = action
  .schema(updateContractSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { data: current } = await db
      .from('contracts')
      .select('id, contract_price, frequency, start_date, end_date, status, price_history' as never)
      .eq('id', parsedInput.contractId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as {
        data: {
          id: string
          contract_price: number
          frequency: string
          start_date: string
          end_date: string | null
          status: string
          price_history: ContractPriceSegment[] | null
        } | null
      }

    if (!current) throw new Error('[APP] 계약을 찾을 수 없습니다')

    const newEndDate = parsedInput.end_date || null
    if (newEndDate && newEndDate < parsedInput.start_date) {
      throw new Error('[APP] 종료일이 시작일보다 빠릅니다')
    }

    // ── 금액 변경 → 구간 이력 갱신 ──
    const priceChanged = parsedInput.contract_price !== current.contract_price
    let priceHistory = Array.isArray(current.price_history) ? [...current.price_history] : []

    if (priceChanged) {
      // 이력이 없던 기존 계약이면, 지금까지의 금액을 첫 구간으로 먼저 세운다
      if (priceHistory.length === 0) {
        priceHistory = [{ from: current.start_date, price: current.contract_price, note: null }]
      }
      // 적용 시작일 — 미입력이면 오늘(KST). 계약 시작보다 빠를 순 없다.
      const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
      let effectiveFrom = parsedInput.price_effective_from || todayKst
      if (effectiveFrom < parsedInput.start_date) effectiveFrom = parsedInput.start_date

      const note = parsedInput.price_change_note?.trim() || null
      const last = priceHistory[priceHistory.length - 1]
      if (last && last.from === effectiveFrom) {
        // 같은 날 두 번 고친 경우 — 구간을 늘리지 않고 덮어쓴다
        priceHistory[priceHistory.length - 1] = { from: effectiveFrom, price: parsedInput.contract_price, note }
      } else {
        priceHistory.push({ from: effectiveFrom, price: parsedInput.contract_price, note })
      }
      priceHistory.sort((a, b) => a.from.localeCompare(b.from))
    } else if (priceHistory.length > 0) {
      // 금액은 그대로인데 시작일이 당겨졌다면 첫 구간도 함께 당겨 매출 공백을 막는다
      if (priceHistory[0].from > parsedInput.start_date) {
        priceHistory[0] = { ...priceHistory[0], from: parsedInput.start_date }
      }
    }

    const { error } = await db
      .from('contracts')
      .update({
        service_type: parsedInput.service_type,
        frequency: parsedInput.frequency,
        contract_price: parsedInput.contract_price,
        start_date: parsedInput.start_date,
        end_date: newEndDate,
        notes: parsedInput.notes?.trim() || null,
        price_history: priceHistory.length > 0 ? priceHistory : null,
      } as never)
      .eq('id', parsedInput.contractId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 계약 수정에 실패했습니다')

    // ── 방문 주기·기간이 바뀌었으면 앞으로의 자동 방문을 다시 깐다 ──
    // (금액만 바뀐 경우엔 일정이 그대로여야 하므로 건드리지 않는다)
    const scheduleChanged =
      parsedInput.frequency !== current.frequency ||
      parsedInput.start_date !== current.start_date ||
      newEndDate !== current.end_date

    if (scheduleChanged) {
      const nowIso = new Date().toISOString()
      // 아직 진행 전(confirmed)인 미래 자동 방문만 정리 — 완료·진행중 방문은 이력이므로 보존
      await db
        .from('bookings')
        .update({ deleted_at: nowIso } as never)
        .eq('contract_id' as never, parsedInput.contractId)
        .eq('business_id', businessId)
        .eq('status', 'confirmed')
        .gt('scheduled_at', nowIso)
        .is('deleted_at', null)

      await db
        .from('contracts')
        .update({ last_generated_until: null } as never)
        .eq('id', parsedInput.contractId)
        .eq('business_id', businessId)

      if (current.status === 'active') {
        const { data: fresh } = await db
          .from('contracts')
          .select('id, business_id, customer_id, service_type, frequency, start_date, end_date, status, last_generated_until, default_worker_id, visit_time' as never)
          .eq('id', parsedInput.contractId)
          .eq('business_id', businessId)
          .maybeSingle() as unknown as { data: import('@/lib/recurring/generate').ContractForGen | null }
        if (fresh) {
          try {
            await generateVisitsForContract(db as unknown as SupabaseClient, fresh)
          } catch (e) {
            console.error('[Contracts] 계약 수정 후 방문 재생성 실패', e)
            await notifyVisitGenFailed(businessId)
          }
        }
      }
    }

    revalidatePath('/dashboard/contracts')
    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard/clients/[customerId]', 'page')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return { success: true, scheduleChanged }
  })

// 계약 상태 변경
const updateContractStatusSchema = z.object({
  contractId: z.string().uuid(),
  status: z.string().refine(
    (v) => ['active', 'paused', 'terminated'].includes(v),
    '유효하지 않은 상태입니다'
  ),
})

export const updateContractStatusAction = action
  .schema(updateContractStatusSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const isResuming = parsedInput.status === 'active'
    // 일시정지·해지 시 앞으로 자동 생성한 방문을 정리하기 위해 커서도 초기화
    const update = isResuming
      ? { status: parsedInput.status }
      : { status: parsedInput.status, last_generated_until: null }

    const { error } = await db
      .from('contracts')
      .update(update as never)
      .eq('id', parsedInput.contractId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 계약 상태 변경에 실패했습니다')

    if (isResuming) {
      // 다시 활성화 → 향후 방문 재생성
      const { data: contract } = await db
        .from('contracts')
        .select('id, business_id, customer_id, service_type, frequency, start_date, end_date, status, last_generated_until, default_worker_id, visit_time' as never)
        .eq('id', parsedInput.contractId)
        .eq('business_id', businessId)
        .maybeSingle() as unknown as { data: import('@/lib/recurring/generate').ContractForGen | null }
      if (contract) {
        try {
          await generateVisitsForContract(db as unknown as SupabaseClient, contract)
        } catch (e) {
          console.error('[Contracts] 재활성화 방문 생성 실패', e)
          await notifyVisitGenFailed(businessId)
        }
      }
    } else {
      // 일시정지·해지 → 아직 진행 전(confirmed)인 미래 자동 방문을 일정에서 정리
      await db
        .from('bookings')
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('contract_id' as never, parsedInput.contractId)
        .eq('business_id', businessId)
        .eq('status', 'confirmed')
        .gt('scheduled_at', new Date().toISOString())
        .is('deleted_at', null)
    }

    revalidatePath('/dashboard/contracts')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 현장 문단속 설정 변경 — "문단속 필요" 여부와 "예상 소요 시간(분)"
const updateContractLockupSchema = z.object({
  contractId: z.string().uuid(),
  requiresLockup: z.boolean(),
  // 문단속 필요일 때만 의미 있음. 30분~8시간 범위.
  expectedDurationMinutes: z.coerce.number().int().min(30).max(480).optional(),
  // 작업 매뉴얼 체크리스트 항목 [{id,label}] — 직원이 항목마다 사진 올려야 완료
  checklistItems: z
    .array(z.object({ id: z.string().min(1).max(64), label: z.string().min(1).max(100) }))
    .max(30)
    .optional(),
})

export const updateContractLockupAction = action
  .schema(updateContractLockupSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const { error } = await db
      .from('contracts')
      .update({
        requires_lockup: parsedInput.requiresLockup,
        expected_duration_minutes: parsedInput.requiresLockup
          ? (parsedInput.expectedDurationMinutes ?? 120)
          : null,
        // 항목이 있으면 저장, 없으면 null(체크리스트 없음)
        checklist_items:
          parsedInput.checklistItems && parsedInput.checklistItems.length > 0
            ? parsedInput.checklistItems
            : null,
      } as never)
      .eq('id', parsedInput.contractId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 문단속 설정 저장에 실패했습니다')

    revalidatePath('/dashboard/contracts')
    return { success: true }
  })
