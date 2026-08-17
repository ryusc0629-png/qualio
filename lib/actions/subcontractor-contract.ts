'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SubcontractorContractData } from '@/lib/contract/subcontractor-contract'

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

// 이 도급사가 내 업체 소속인지 확인 — 남의 도급사 계약서를 건드리지 못하게 막는다
async function assertMyContractor(
  db: Awaited<ReturnType<typeof getBusinessId>>['db'],
  businessId: string,
  workerId: string
) {
  const { data } = await db
    .from('workers' as never)
    .select('id, type')
    .eq('id' as never, workerId)
    .eq('business_id' as never, businessId)
    .maybeSingle() as unknown as { data: { id: string; type: string } | null }

  if (!data) throw new Error('[APP] 도급사 정보를 찾을 수 없습니다')
  if (data.type !== 'contractor') throw new Error('[APP] 도급사로 등록된 곳만 계약서를 쓸 수 있어요')
}

const partySchema = z.object({
  company: z.string().max(60).optional().default(''),
  ceo:     z.string().max(30).optional().default(''),
  address: z.string().max(200).optional().default(''),
  phone:   z.string().max(30).optional().default(''),
})

const contractSchema = z.object({
  workerId: z.string().uuid(),
  partyA: partySchema,
  partyB: partySchema,
  settlementMode: z.string().refine(
    (v) => ['revenue_share', 'per_job', 'per_day'].includes(v),
    { message: '정산 방식을 선택해주세요' }
  ),
  sharePercent:  z.number().int().min(0).max(100).nullable(),
  unitPrice:     z.number().int().min(0).max(100_000_000).nullable(),
  closingDay:    z.string().max(20).optional().default('매월 말일'),
  payDay:        z.number().int().min(1).max(31).nullable(),
  lossSplitPercent: z.number().int().min(0).max(100),
  termMonths:    z.number().int().min(1).max(120),
  includeTransferOption: z.boolean(),
  includeGrowthSupport: z.boolean(),
  specialTerms:  z.string().max(3000).nullable(),
  contractDate:  z.string().max(10).nullable(),
})

// 계약서 내용 저장 — 빈칸을 다 안 채워도 저장된다(초안으로 두고 나중에 이어서 씀)
export const saveSubcontractorContractAction = action
  .schema(contractSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    const { workerId, ...rest } = parsedInput
    await assertMyContractor(db, businessId, workerId)

    const contractData: SubcontractorContractData = {
      partyA: rest.partyA,
      partyB: rest.partyB,
      settlementMode: rest.settlementMode as SubcontractorContractData['settlementMode'],
      sharePercent: rest.sharePercent,
      unitPrice: rest.unitPrice,
      closingDay: rest.closingDay,
      payDay: rest.payDay,
      lossSplitPercent: rest.lossSplitPercent,
      termMonths: rest.termMonths,
      includeTransferOption: rest.includeTransferOption,
      includeGrowthSupport: rest.includeGrowthSupport,
      specialTerms: rest.specialTerms,
      contractDate: rest.contractDate,
    }

    const { error } = await db
      .from('workers' as never)
      .update({ contract_data: contractData } as never)
      .eq('id' as never, workerId)
      .eq('business_id' as never, businessId)

    if (error) {
      console.error('[SubcontractorContract] 저장 실패:', error)
      throw new Error('[APP] 저장 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/schedule')
    revalidatePath(`/dashboard/contractors/${workerId}`)
    return { success: true }
  })

// 날인본을 회수했을 때 '계약 완료'로 표시 / 되돌리기
export const setSubcontractorContractSignedAction = action
  .schema(z.object({
    workerId: z.string().uuid(),
    signed:   z.boolean(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    await assertMyContractor(db, businessId, parsedInput.workerId)

    // 내용이 비어 있으면 완료로 볼 수 없다 — 빈 계약서에 완료 배지가 붙는 걸 막는다
    if (parsedInput.signed) {
      const { data } = await db
        .from('workers' as never)
        .select('contract_data')
        .eq('id' as never, parsedInput.workerId)
        .maybeSingle() as unknown as { data: { contract_data: unknown } | null }

      if (!data?.contract_data) {
        throw new Error('[APP] 계약서를 먼저 작성하고 저장해주세요')
      }
    }

    const { error } = await db
      .from('workers' as never)
      .update({ contract_signed_at: parsedInput.signed ? new Date().toISOString() : null } as never)
      .eq('id' as never, parsedInput.workerId)
      .eq('business_id' as never, businessId)

    if (error) {
      console.error('[SubcontractorContract] 완료 표시 실패:', error)
      throw new Error('[APP] 처리 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/schedule')
    revalidatePath(`/dashboard/contractors/${parsedInput.workerId}`)
    return { success: true }
  })
