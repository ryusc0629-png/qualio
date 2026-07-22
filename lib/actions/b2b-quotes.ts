'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateSpecSheet } from '@/lib/ai/spec-sheet'
import { extractQuoteFromMeeting } from '@/lib/ai/extract-quote-from-meeting'
import { revalidatePath } from 'next/cache'

const quoteItemSchema = z.object({
  name:       z.string().min(1),
  unit:       z.string().min(1),
  qty:        z.number().min(1),
  unit_price: z.number().min(0),
})

const saveB2bQuoteSchema = z.object({
  // 리드(영업 중) 또는 고객(계약 중) 중 하나에 연결 — 둘 중 하나는 필수
  leadId:       z.string().uuid().optional(),
  customerId:   z.string().uuid().optional(),
  quoteNumber:  z.string().optional(),
  validUntil:   z.string().optional(),
  items:        z.array(quoteItemSchema).min(1, '항목을 하나 이상 입력해주세요'),
  totalAmount:  z.number().min(0),
  taxIncluded:  z.boolean(),
  conditions:   z.string().optional(),
  siteName:     z.string().optional(),
  siteAddress:  z.string().optional(),
  siteArea:     z.string().optional(),
  frequency:    z.string().optional(),
  workerCount:  z.number().optional(),
  specContent:  z.string().optional(),
  jobType:      z.string().refine(
    (v) => ['recurring', 'one_off'].includes(v),
    { message: '유효하지 않은 작업 유형입니다' },
  ).optional(),
})

const generateSpecSchema = z.object({
  // 대상 식별용(본문에선 미사용) — 리드/고객 어느 쪽이든 허용
  leadId:       z.string().uuid().optional(),
  customerId:   z.string().uuid().optional(),
  clientName:   z.string().min(1),
  siteName:     z.string().optional(),
  siteAddress:  z.string().optional(),
  siteArea:     z.string().optional(),
  frequency:    z.string().optional(),
  workerCount:  z.number().optional(),
  serviceItems: z.array(z.string()),
  conditions:   z.string().optional(),
  jobType:      z.string().refine(
    (v) => ['recurring', 'one_off'].includes(v),
    { message: '유효하지 않은 작업 유형입니다' },
  ).optional(),
})

const extractFromMeetingSchema = z.object({
  leadId: z.string().uuid(),
})

async function getAuth() {
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

// 이 리드의 최근 미팅 기록(요약 우선, 없으면 원문)을 하나의 텍스트로 모음 — 없으면 null
async function getLeadMeetingText(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  leadId: string,
): Promise<string | null> {
  const { data: meetings } = await db
    .from('lead_activities')
    .select('content, transcript, activity_at')
    .eq('lead_id', leadId)
    .eq('business_id', businessId)
    .eq('type', 'meeting')
    .order('activity_at', { ascending: false })
    .limit(3)

  if (!meetings || meetings.length === 0) return null

  const text = meetings
    .map((m) => (m.content?.trim() || m.transcript?.trim() || ''))
    .filter(Boolean)
    .join('\n\n---\n\n')

  return text.trim() || null
}

// 시방서 AI 생성
export const generateSpecAction = action
  .schema(generateSpecSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()

    const { data: business } = await db
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .maybeSingle()

    // 리드에 미팅 기록이 있으면 시방서가 실제 미팅 내용을 따라가도록 함께 주입
    // (단, 견적 항목에 없는 서비스는 미팅에 나와도 시방서에 넣지 않음 — spec-sheet.ts 가드레일)
    const meetingNotes = parsedInput.leadId
      ? await getLeadMeetingText(db, businessId, parsedInput.leadId)
      : null

    const specContent = await generateSpecSheet({
      businessName: business?.name ?? '청소업체',
      clientName:   parsedInput.clientName,
      siteName:     parsedInput.siteName ?? null,
      siteAddress:  parsedInput.siteAddress ?? null,
      siteArea:     parsedInput.siteArea ?? null,
      frequency:    parsedInput.frequency ?? null,
      workerCount:  parsedInput.workerCount ?? null,
      serviceItems: parsedInput.serviceItems,
      conditions:   parsedInput.conditions ?? null,
      jobType:      parsedInput.jobType === 'one_off' ? 'one_off' : 'recurring',
      meetingNotes,
    })

    return { specContent }
  })

// 미팅 기록 → 견적서·시방서 입력칸 자동 채우기
// 이 리드의 최근 미팅 기록(요약 우선, 없으면 원문)을 모아 분석해 구조화된 항목으로 반환
export const extractQuoteFromMeetingAction = action
  .schema(extractFromMeetingSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()

    const meetingText = await getLeadMeetingText(db, businessId, parsedInput.leadId)
    if (!meetingText) {
      throw new Error('[APP] 불러올 미팅 기록이 없어요. 먼저 미팅 녹음을 정리해 저장해주세요')
    }

    const fields = await extractQuoteFromMeeting(meetingText)
    return { fields }
  })

// 견적서 저장
export const saveB2bQuoteAction = action
  .schema(saveB2bQuoteSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()

    const isCustomer = Boolean(parsedInput.customerId)
    if (!parsedInput.leadId && !parsedInput.customerId) {
      throw new Error('[APP] 견적 대상(거래처)이 지정되지 않았습니다')
    }

    // 대상(리드 또는 고객)별로 기존 견적서 1건을 찾아 있으면 수정, 없으면 새로 생성
    const existingLookup = db
      .from('b2b_quotes')
      .select('id')
      .eq('business_id', businessId)
    const { data: existing } = isCustomer
      ? await existingLookup.eq('customer_id' as never, parsedInput.customerId!).maybeSingle()
      : await existingLookup.eq('lead_id', parsedInput.leadId!).maybeSingle()

    const payload = {
      lead_id:      parsedInput.leadId ?? null,
      customer_id:  parsedInput.customerId ?? null,
      business_id:  businessId,
      quote_number: parsedInput.quoteNumber ?? null,
      valid_until:  parsedInput.validUntil ?? null,
      items:        parsedInput.items,
      total_amount: parsedInput.totalAmount,
      tax_included: parsedInput.taxIncluded,
      conditions:   parsedInput.conditions ?? null,
      site_name:    parsedInput.siteName ?? null,
      site_address: parsedInput.siteAddress ?? null,
      site_area:    parsedInput.siteArea ?? null,
      frequency:    parsedInput.frequency ?? null,
      worker_count: parsedInput.workerCount ?? null,
      spec_content: parsedInput.specContent ?? null,
      // 일회성이면 주기는 저장하지 않음 (정기 전제 제거)
      job_type:     parsedInput.jobType === 'one_off' ? 'one_off' : 'recurring',
      updated_at:   new Date().toISOString(),
    }

    // job_type 컬럼이 database.ts 타입에 아직 반영 안 됨 → as never 단언
    if (existing) {
      const { error } = await db
        .from('b2b_quotes')
        .update(payload as never)
        .eq('id', existing.id)
      if (error) throw new Error('[APP] 견적서 저장에 실패했습니다')
    } else {
      const { error } = await db.from('b2b_quotes').insert(payload as never)
      if (error) throw new Error('[APP] 견적서 저장에 실패했습니다')
    }

    if (isCustomer) revalidatePath(`/dashboard/clients/${parsedInput.customerId}`)
    else revalidatePath(`/dashboard/pipeline/${parsedInput.leadId}`)
    return { success: true }
  })
