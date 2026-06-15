'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateSpecSheet } from '@/lib/ai/spec-sheet'
import { revalidatePath } from 'next/cache'

const quoteItemSchema = z.object({
  name:       z.string().min(1),
  unit:       z.string().min(1),
  qty:        z.number().min(1),
  unit_price: z.number().min(0),
})

const saveB2bQuoteSchema = z.object({
  leadId:       z.string().uuid(),
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
})

const generateSpecSchema = z.object({
  leadId:       z.string().uuid(),
  clientName:   z.string().min(1),
  siteName:     z.string().optional(),
  siteAddress:  z.string().optional(),
  siteArea:     z.string().optional(),
  frequency:    z.string().optional(),
  workerCount:  z.number().optional(),
  serviceItems: z.array(z.string()),
  conditions:   z.string().optional(),
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
    })

    return { specContent }
  })

// 견적서 저장
export const saveB2bQuoteAction = action
  .schema(saveB2bQuoteSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()

    const { data: existing } = await db
      .from('b2b_quotes')
      .select('id')
      .eq('lead_id', parsedInput.leadId)
      .eq('business_id', businessId)
      .maybeSingle()

    const payload = {
      lead_id:      parsedInput.leadId,
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
      updated_at:   new Date().toISOString(),
    }

    if (existing) {
      const { error } = await db
        .from('b2b_quotes')
        .update(payload)
        .eq('id', existing.id)
      if (error) throw new Error('[APP] 견적서 저장에 실패했습니다')
    } else {
      const { error } = await db.from('b2b_quotes').insert(payload)
      if (error) throw new Error('[APP] 견적서 저장에 실패했습니다')
    }

    revalidatePath(`/dashboard/pipeline/${parsedInput.leadId}`)
    return { success: true }
  })
