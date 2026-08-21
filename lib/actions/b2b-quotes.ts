'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateSpecSheet } from '@/lib/ai/spec-sheet'
import { extractQuoteFromMeeting } from '@/lib/ai/extract-quote-from-meeting'
import type { QuoteVocabulary } from '@/lib/ai/extract-quote-from-meeting'
import { spendQuota } from '@/lib/ratelimit/daily-quota'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getNextQuoteNumber } from '@/lib/utils/quote-number'
import { mergeAddressDetail } from '@/lib/address/format'

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
  // 수정할 기존 견적서 id — 있으면 그 견적서만 수정, 없으면 새 견적서로 추가(한 거래처에 여러 장 가능)
  quoteId:      z.string().uuid().optional(),
  // 견적서 이름(라벨) — 목록에서 여러 장 구분용, 선택
  title:        z.string().optional(),
  quoteNumber:  z.string().optional(),
  validUntil:   z.string().optional(),
  items:        z.array(quoteItemSchema).min(1, '항목을 하나 이상 입력해주세요'),
  totalAmount:  z.number().min(0),
  taxIncluded:  z.boolean(),
  // 할인 — rate(할인율 %) | amount(정액 원). 없으면 discountType 생략
  discountType: z.string().refine(
    (v) => ['rate', 'amount'].includes(v),
    { message: '유효하지 않은 할인 유형입니다' },
  ).optional(),
  discountValue: z.number().min(0).optional(),
  conditions:   z.string().optional(),
  siteName:     z.string().optional(),
  siteAddress:  z.string().optional(),
  siteArea:     z.string().optional(),
  frequency:    z.string().optional(),
  workerCount:  z.number().optional(),
  specContent:  z.string().optional(),
  contractContent: z.string().optional(),
  jobType:      z.string().refine(
    (v) => ['recurring', 'one_off'].includes(v),
    { message: '유효하지 않은 작업 유형입니다' },
  ).optional(),
  // 금액 입력 방식: itemized(항목별 계산) | lump(총액 직접) — 재열람·미리보기에서 방식 유지용
  amountMode:   z.string().refine(
    (v) => ['itemized', 'lump'].includes(v),
    { message: '유효하지 않은 금액 입력 방식입니다' },
  ).optional(),
  // 이 견적서가 '상담 기록에서 자동 채우기'로 시작됐으면 그 기록 id — 사장님이 고친 결과를 짝지어 남긴다
  autofillLogId: z.string().uuid().optional(),
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

// 이 리드의 최근 상담 기록을 하나의 텍스트로 모음 — 없으면 null
// 미팅뿐 아니라 방문·메모·전화 상담도 포함(내용은 같은 상담 텍스트라 자동채우기 대상). 견적 로그(quote)는 제외.
//
// ★ withTranscript: 정리본(content)에 더해 녹음 원문(transcript)까지 붙일지.
//   정리본은 원문의 33~58%로 줄어들면서 평수·인원·제외 범위 같은 '견적에 꼭 필요한 숫자'가 먼저 사라진다.
//   그래서 자동 채우기처럼 기계가 읽는 곳에만 원문을 함께 넘긴다.
//   사장님이 화면에서 읽는 회의록은 그대로 짧은 정리본이다(읽고 고치는 시간이 늘면 안 되므로).
const MEETING_LIKE_TYPES = ['meeting', 'visit', 'note', 'call'] as const
async function getLeadMeetingText(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  leadId: string,
  withTranscript = false,
): Promise<string | null> {
  const { data: meetings } = await db
    .from('lead_activities')
    .select('content, transcript, activity_at')
    .eq('lead_id', leadId)
    .eq('business_id', businessId)
    .in('type', MEETING_LIKE_TYPES as unknown as string[])
    .order('activity_at', { ascending: false })
    .limit(3)

  if (!meetings || meetings.length === 0) return null

  const text = meetings
    .map((m) => {
      const summary = m.content?.trim() ?? ''
      const transcript = m.transcript?.trim() ?? ''
      if (!withTranscript) return summary || transcript
      // 정리본과 원문이 둘 다 있고 서로 다를 때만 원문을 덧붙인다(같은 글을 두 번 넣지 않도록)
      if (summary && transcript && summary !== transcript) {
        return `[상담 정리본]\n${summary}\n\n[녹음 원문]\n${transcript}`
      }
      return summary || transcript
    })
    .filter(Boolean)
    .join('\n\n---\n\n')

  return text.trim() || null
}

// 이 업체가 평소 쓰는 견적 어휘(항목명·단위)를 모은다 — 등록 서비스 항목 + 지난 견적서
// 이걸 안 주면 자동 채우기가 항목명을 자유 문장으로 짓고 단위도 제멋대로 붙는다.
// (실제로 저장된 견적 항목 54개의 단위는 원·주·품·월·평 순인데 코드 기본값은 '식'이었다)
const MAX_ITEM_NAME_LEN = 20   // 문장처럼 긴 항목명은 어휘로 쓸 수 없어 제외
const MAX_VOCAB_ITEMS = 25

async function getQuoteVocabulary(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
): Promise<QuoteVocabulary | null> {
  const [{ data: services }, { data: pastQuotes }] = await Promise.all([
    db.from('service_items').select('name').eq('business_id', businessId).limit(40),
    db
      .from('b2b_quotes')
      .select('items, job_type' as never)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(30) as unknown as Promise<{
        data: { items: { name?: string; unit?: string }[] | null; job_type: string | null }[] | null
      }>,
  ])

  const names: string[] = []
  const addName = (raw: unknown) => {
    if (typeof raw !== 'string') return
    // 견적서 복제로 생긴 '(복사)' 꼬리표는 떼고 원래 이름으로 센다
    const name = raw.trim().replace(/\s*\(복사\)\s*$/, '').trim()
    if (!name || name.length > MAX_ITEM_NAME_LEN) return
    if (!names.includes(name)) names.push(name)
  }

  // 등록해 둔 서비스 항목이 우선 — 사장님이 직접 정한 이름이라 가장 정확하다
  for (const s of services ?? []) addName((s as { name: string | null }).name)

  // 지난 견적서에서 쓴 단위를 작업 유형별로 센다
  const recurringUnits = new Map<string, number>()
  const oneOffUnits = new Map<string, number>()
  for (const q of pastQuotes ?? []) {
    const bucket = q.job_type === 'one_off' ? oneOffUnits : recurringUnits
    for (const item of q.items ?? []) {
      addName(item?.name)
      const unit = typeof item?.unit === 'string' ? item.unit.trim() : ''
      if (unit) bucket.set(unit, (bucket.get(unit) ?? 0) + 1)
    }
  }

  const topUnits = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([unit]) => unit)

  const vocab: QuoteVocabulary = {
    itemNames: names.slice(0, MAX_VOCAB_ITEMS),
    recurringUnits: topUnits(recurringUnits),
    oneOffUnits: topUnits(oneOffUnits),
  }

  // 재료가 하나도 없으면(갓 가입한 업체) 어휘 문단을 아예 붙이지 않는다
  const isEmpty = !vocab.itemNames.length && !vocab.recurringUnits.length && !vocab.oneOffUnits.length
  return isEmpty ? null : vocab
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
      ? await getLeadMeetingText(db, businessId, parsedInput.leadId, true)
      : null

    // 하루 한도 — 사장님이 직접 누르는 버튼이라 폭주 가능성이 있다
    await spendQuota(db as unknown as SupabaseClient, 'document', businessId)

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

    // 기계가 읽는 입력이라 녹음 원문까지 함께 넘긴다(정리본에서 사라진 숫자를 되살리기 위해)
    const meetingText = await getLeadMeetingText(db, businessId, parsedInput.leadId, true)
    if (!meetingText) {
      throw new Error('[APP] 불러올 상담 기록이 없어요. 먼저 상담 기록(미팅·방문·메모 등)을 저장해주세요')
    }

    await spendQuota(db as unknown as SupabaseClient, 'document', businessId)

    const vocab = await getQuoteVocabulary(db, businessId)
    const fields = await extractQuoteFromMeeting(meetingText, vocab)

    // 무엇을 채웠는지 기록해 둔다 — 저장 시점에 사장님이 고친 값과 짝지어진다.
    // 기록 실패가 자동 채우기를 막으면 안 되므로 조용히 넘어간다(부가 작업).
    let autofillLogId: string | null = null
    const { data: log, error: logError } = await (db as unknown as SupabaseClient)
      .from('quote_autofill_logs')
      .insert({
        business_id:  businessId,
        lead_id:      parsedInput.leadId,
        extracted:    fields,
        source_chars: meetingText.length,
      })
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    if (logError) console.error('[B2bQuotes] 자동 채우기 기록 실패:', logError)
    else autofillLogId = log?.id ?? null

    return { fields, autofillLogId }
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

    // quoteId가 오면 그 견적서만 수정, 없으면 새 견적서로 추가 (한 거래처에 여러 장 가능)
    // public_token도 함께 조회 — 저장 후 '공개 링크(/quote/{token})' 미리보기로 열기 위함
    let existing: { id: string; public_token: string | null } | null = null
    if (parsedInput.quoteId) {
      const { data } = await db
        .from('b2b_quotes')
        .select('id, public_token' as never)
        .eq('id', parsedInput.quoteId)
        .eq('business_id', businessId)
        .maybeSingle() as unknown as { data: { id: string; public_token: string | null } | null }
      existing = data
    }

    // 새 견적서는 업체별 실제 순번을 서버에서 부여(클라이언트 값 무시) → 항상 연속·중복 없음
    // 기존 견적서 수정은 이미 매겨진 번호를 그대로 유지
    const quoteNumber = existing
      ? (parsedInput.quoteNumber ?? null)
      : await getNextQuoteNumber(db, businessId)

    const payload = {
      lead_id:      parsedInput.leadId ?? null,
      customer_id:  parsedInput.customerId ?? null,
      business_id:  businessId,
      title:        parsedInput.title ?? null,
      quote_number: quoteNumber,
      valid_until:  parsedInput.validUntil ?? null,
      items:        parsedInput.items,
      total_amount: parsedInput.totalAmount,
      tax_included: parsedInput.taxIncluded,
      // 할인 없으면 type=null, value=0
      discount_type:  parsedInput.discountType ?? null,
      discount_value: parsedInput.discountValue ?? 0,
      conditions:   parsedInput.conditions ?? null,
      site_name:    parsedInput.siteName ?? null,
      site_address: parsedInput.siteAddress ?? null,
      site_area:    parsedInput.siteArea ?? null,
      frequency:    parsedInput.frequency ?? null,
      worker_count: parsedInput.workerCount ?? null,
      spec_content: parsedInput.specContent ?? null,
      contract_content: parsedInput.contractContent ?? null,
      // 일회성이면 주기는 저장하지 않음 (정기 전제 제거)
      job_type:     parsedInput.jobType === 'one_off' ? 'one_off' : 'recurring',
      amount_mode:  parsedInput.amountMode ?? null,
      updated_at:   new Date().toISOString(),
    }

    // job_type 컬럼이 database.ts 타입에 아직 반영 안 됨 → as never 단언
    let quoteId = existing?.id
    let publicToken = existing?.public_token ?? null
    if (existing) {
      const { error } = await db
        .from('b2b_quotes')
        .update(payload as never)
        .eq('id', existing.id)
      if (error) throw new Error('[APP] 견적서 저장에 실패했습니다')
    } else {
      // 새 견적서 — 삽입 후 생성된 id·public_token을 받아 미리보기·링크에 사용
      const { data: inserted, error } = await db
        .from('b2b_quotes')
        .insert(payload as never)
        .select('id, public_token' as never)
        .single() as unknown as { data: { id: string; public_token: string | null } | null; error: unknown }
      if (error || !inserted) throw new Error('[APP] 견적서 저장에 실패했습니다')
      quoteId = inserted.id
      publicToken = inserted.public_token
    }

    // 견적서에 적은 현장 주소의 상세(층·호수)를 거래처·고객 주소에도 이어붙인다.
    // 같은 건물일 때만 보강하므로(mergeAddressDetail) 본사와 현장이 다른 경우는 그대로 둔다.
    // 이게 없으면 고객 전환·예약 화면에서 사장님이 "3층"을 매번 다시 입력하게 된다.
    const table = isCustomer ? 'customers' : 'leads'
    const rowId = isCustomer ? parsedInput.customerId : parsedInput.leadId
    if (rowId && parsedInput.siteAddress) {
      const { data: row } = await db
        .from(table)
        .select('address')
        .eq('id', rowId)
        .eq('business_id', businessId)
        .maybeSingle() as unknown as { data: { address: string | null } | null }

      const mergedAddress = mergeAddressDetail(row?.address, parsedInput.siteAddress)
      if (mergedAddress) {
        const { error: addrError } = await db
          .from(table)
          .update({ address: mergedAddress } as never)
          .eq('id', rowId)
        // 주소 보강 실패는 견적서 저장을 막지 않는다(부가 작업)
        if (addrError) console.error('[B2bQuotes] 주소 상세 동기화 실패:', addrError)
      }
    }

    // 자동 채우기로 시작한 견적서면, 사장님이 최종 저장한 값을 같은 행에 남긴다.
    // 자동으로 채운 값과 이 값의 차이가 "매번 다시 고치시는 칸"을 알려준다.
    if (parsedInput.autofillLogId) {
      const { error: logError } = await (db as unknown as SupabaseClient)
        .from('quote_autofill_logs')
        .update({
          quote_id: quoteId ?? null,
          saved: {
            jobType:      payload.job_type,
            serviceItems: parsedInput.items.map((it) => ({ name: it.name, unit: it.unit })),
            siteName:     payload.site_name,
            siteAddress:  payload.site_address,
            siteArea:     payload.site_area,
            frequency:    payload.frequency,
            workerCount:  payload.worker_count,
            conditions:   payload.conditions,
            title:        payload.title,
          },
          saved_at: new Date().toISOString(),
        })
        .eq('id', parsedInput.autofillLogId)
        .eq('business_id', businessId)
      // 기록 실패는 견적서 저장을 막지 않는다(부가 작업)
      if (logError) console.error('[B2bQuotes] 자동 채우기 결과 기록 실패:', logError)
    }

    if (isCustomer) revalidatePath(`/dashboard/clients/${parsedInput.customerId}`)
    else revalidatePath(`/dashboard/pipeline/${parsedInput.leadId}`)
    return { success: true, quoteId, publicToken }
  })

// 견적서 복제 — 이 견적서를 그대로 복사해 비슷한 새 견적서를 빠르게 만든다.
// (다른 현장용·수정본 등) 새 견적번호를 부여하고, 공개 링크(public_token)는
// DB가 새로 생성한다(견적서마다 고유 링크라 원본 링크를 재사용하면 안 됨).
const duplicateB2bQuoteSchema = z.object({
  quoteId:    z.string().uuid(),
  leadId:     z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
})

export const duplicateB2bQuoteAction = action
  .schema(duplicateB2bQuoteSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()

    // 원본 견적서 조회 — 본인 업체 것만
    const { data: src } = await db
      .from('b2b_quotes')
      .select('*')
      .eq('id', parsedInput.quoteId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as { data: Record<string, unknown> | null }

    if (!src) throw new Error('[APP] 복사할 견적서를 찾을 수 없습니다')

    const quoteNumber = await getNextQuoteNumber(db, businessId)
    // 새 견적서 이름 — 원본 이름(없으면 현장명·번호) 뒤에 '(복사)'를 붙여 목록에서 구분
    const baseTitle =
      (src.title as string | null)?.trim() ||
      (src.site_name as string | null)?.trim() ||
      (src.quote_number as string | null) ||
      '견적서'

    // 원본 내용은 그대로, id·공개링크·번호·생성일만 새로 부여 (public_token은 넣지 않아 DB가 자동 생성)
    const payload = {
      lead_id:          src.lead_id ?? null,
      customer_id:      src.customer_id ?? null,
      business_id:      businessId,
      title:            `${baseTitle} (복사)`,
      quote_number:     quoteNumber,
      valid_until:      src.valid_until ?? null,
      items:            src.items ?? [],
      total_amount:     src.total_amount ?? 0,
      tax_included:     src.tax_included ?? false,
      discount_type:    src.discount_type ?? null,
      discount_value:   src.discount_value ?? 0,
      conditions:       src.conditions ?? null,
      site_name:        src.site_name ?? null,
      site_address:     src.site_address ?? null,
      site_area:        src.site_area ?? null,
      frequency:        src.frequency ?? null,
      worker_count:     src.worker_count ?? null,
      spec_content:     src.spec_content ?? null,
      contract_content: src.contract_content ?? null,
      job_type:         src.job_type ?? 'recurring',
      amount_mode:      src.amount_mode ?? null,
      updated_at:       new Date().toISOString(),
    }

    const { data: inserted, error } = await db
      .from('b2b_quotes')
      .insert(payload as never)
      .select('id, public_token' as never)
      .single() as unknown as { data: { id: string; public_token: string | null } | null; error: unknown }

    if (error || !inserted) throw new Error('[APP] 견적서 복사에 실패했습니다')

    if (parsedInput.customerId) revalidatePath(`/dashboard/clients/${parsedInput.customerId}`)
    if (parsedInput.leadId) revalidatePath(`/dashboard/pipeline/${parsedInput.leadId}`)
    return { success: true, quoteId: inserted.id, publicToken: inserted.public_token }
  })

// 견적서 삭제 — 한 거래처에 여러 장이 있을 때 개별 삭제
const deleteB2bQuoteSchema = z.object({
  quoteId:    z.string().uuid(),
  leadId:     z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
})

export const deleteB2bQuoteAction = action
  .schema(deleteB2bQuoteSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()

    const { error } = await db
      .from('b2b_quotes')
      .delete()
      .eq('id', parsedInput.quoteId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 견적서 삭제에 실패했습니다')

    if (parsedInput.customerId) revalidatePath(`/dashboard/clients/${parsedInput.customerId}`)
    if (parsedInput.leadId) revalidatePath(`/dashboard/pipeline/${parsedInput.leadId}`)
    return { success: true }
  })
