'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import { generateOnboardingNotes } from '@/lib/ai/onboarding-note'

// 공통 인증 — 로그인 사용자의 business_id 확보
async function getAuthedBusiness() {
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

// 계약이 이 업체 소속인지 확인하고 고객 정보까지 반환
async function loadContractContext(db: ReturnType<typeof createServiceClient>, businessId: string, contractId: string) {
  const { data: contract } = (await db
    .from('contracts')
    .select('id, customer_id, service_type')
    .eq('id', contractId)
    .eq('business_id', businessId)
    .maybeSingle()) as unknown as {
    data: { id: string; customer_id: string; service_type: string | null } | null
  }
  if (!contract) throw new Error('[APP] 계약을 찾을 수 없습니다')
  return contract
}

const itemSchema = z.object({
  id: z.string(),
  space: z.string(),
  problem: z.string(),
  resolution: z.string().refine(
    (v) => ['regular', 'service', 'paid'].includes(v),
    { message: '유효하지 않은 해결 구분입니다' },
  ),
  beforeUrl: z.string().nullable(),
  afterUrl: z.string().nullable(),
  result: z.string().refine(
    (v) => ['', 'resolved', 'partial', 'paid_recommend'].includes(v),
    { message: '유효하지 않은 결과 값입니다' },
  ),
  nextAction: z.string(),
})

const saveSchema = z.object({
  contractId: z.string().uuid(),
  beforeNote: z.string().optional(),
  specNote: z.string().optional(),
  managementNote: z.string().optional(),
  items: z.array(itemSchema).max(50),
  status: z.string().refine((v) => ['draft', 'shared'].includes(v), { message: '유효하지 않은 상태입니다' }),
})

// 초도 진단 리포트 저장(생성 또는 갱신) — 계약 1건당 1개
export const saveOnboardingReportAction = action
  .schema(saveSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthedBusiness()
    const contract = await loadContractContext(db, businessId, parsedInput.contractId)

    const { data: existing } = (await db
      .from('onboarding_reports' as never)
      .select('id, status, public_token, shared_at')
      .eq('business_id' as never, businessId)
      .eq('contract_id' as never, parsedInput.contractId)
      .maybeSingle()) as unknown as {
      data: { id: string; status: string; public_token: string; shared_at: string | null } | null
    }

    const nowIso = new Date().toISOString()
    const payload = {
      business_id: businessId,
      contract_id: parsedInput.contractId,
      customer_id: contract.customer_id,
      before_note: parsedInput.beforeNote ?? null,
      spec_note: parsedInput.specNote ?? null,
      management_note: parsedInput.managementNote ?? null,
      items: parsedInput.items,
      status: parsedInput.status,
      updated_at: nowIso,
      // '공유함'으로 처음 넘어갈 때만 shared_at 기록
      shared_at:
        parsedInput.status === 'shared'
          ? (existing?.shared_at ?? nowIso)
          : (existing?.shared_at ?? null),
    }

    let id = existing?.id
    let publicToken = existing?.public_token

    if (existing) {
      const { error } = await db
        .from('onboarding_reports' as never)
        .update(payload as never)
        .eq('id' as never, existing.id)
      if (error) throw new Error('[APP] 저장하지 못했어요. 다시 눌러주세요')
    } else {
      const { data: inserted, error } = (await db
        .from('onboarding_reports' as never)
        .insert(payload as never)
        .select('id, public_token')
        .single()) as unknown as {
        data: { id: string; public_token: string } | null
        error: unknown
      }
      if (error || !inserted) throw new Error('[APP] 저장하지 못했어요. 다시 눌러주세요')
      id = inserted.id
      publicToken = inserted.public_token
    }

    revalidatePath(`/dashboard/contracts/${parsedInput.contractId}/onboarding-report`)
    revalidatePath(`/dashboard/clients/${contract.customer_id}`)

    return { success: true, id, publicToken }
  })

const generateSchema = z.object({
  contractId: z.string().uuid(),
  items: z.array(itemSchema).max(50),
})

// 작업 시방·관리 멘트 전문가 초안 생성
export const generateOnboardingNotesAction = action
  .schema(generateSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthedBusiness()
    const contract = await loadContractContext(db, businessId, parsedInput.contractId)

    const [{ data: business }, { data: customer }] = await Promise.all([
      db.from('businesses').select('name').eq('id', businessId).maybeSingle(),
      db.from('customers').select('name').eq('id', contract.customer_id).maybeSingle(),
    ])

    const notes = await generateOnboardingNotes({
      businessName: business?.name ?? '저희 업체',
      customerName: customer?.name ?? '고객님',
      serviceType: contract.service_type,
      items: parsedInput.items.map((it) => ({
        space: it.space,
        problem: it.problem,
        resolution: it.resolution as 'regular' | 'service' | 'paid',
        result: it.result as '' | 'resolved' | 'partial' | 'paid_recommend',
        nextAction: it.nextAction,
      })),
    })

    return { success: true, notes }
  })
