'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import { generateVisitsForContract } from '@/lib/recurring/generate'

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
    }).select('id').single()

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
    }

    revalidatePath('/dashboard/contracts')
    revalidatePath('/dashboard/customers')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return { success: true }
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
        .select('id, business_id, customer_id, service_type, frequency, start_date, end_date, status, last_generated_until, default_worker_id' as never)
        .eq('id', parsedInput.contractId)
        .eq('business_id', businessId)
        .maybeSingle() as unknown as { data: import('@/lib/recurring/generate').ContractForGen | null }
      if (contract) {
        try {
          await generateVisitsForContract(db as unknown as SupabaseClient, contract)
        } catch (e) {
          console.error('[Contracts] 재활성화 방문 생성 실패', e)
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
