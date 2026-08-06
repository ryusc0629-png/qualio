'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import type { ProposalSettings } from '@/lib/proposal/content'

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

const CATEGORIES = ['general', 'hospital', 'office', 'store', 'interior']
const THEMES = ['brand', 'emerald', 'gold', 'slate']

const statSchema = z.object({
  value: z.string().max(10),
  unit: z.string().max(10),
  label: z.string().max(60),
})

const saveProposalSchema = z.object({
  category: z.string().refine((v) => CATEGORIES.includes(v), '유효하지 않은 카테고리입니다'),
  theme: z.string().refine((v) => THEMES.includes(v), '유효하지 않은 테마입니다'),
  headline: z.string().max(120).optional(),
  kicker: z.string().max(60).optional(),
  stats: z.array(statSchema).max(3).optional(),
  sections: z.object({
    investment: z.boolean(),
    principles: z.boolean(),
    refund: z.boolean(),
    process: z.boolean(),
    trust: z.boolean(),
  }),
})

// 소개서 설정 저장 — businesses.proposal_settings(jsonb)에 소개서 전용값만 담는다
export const saveProposalSettingsAction = action
  .schema(saveProposalSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    const settings: ProposalSettings = {
      template: 'company',
      category: parsedInput.category as ProposalSettings['category'],
      theme: parsedInput.theme as ProposalSettings['theme'],
      headline: parsedInput.headline?.trim() || undefined,
      kicker: parsedInput.kicker?.trim() || undefined,
      stats: parsedInput.stats,
      sections: parsedInput.sections,
    }

    const { error } = await db
      .from('businesses')
      .update({ proposal_settings: settings } as never)
      .eq('id', businessId)

    if (error) {
      console.error('[Proposal] 설정 저장 실패:', error)
      throw new Error('[APP] 소개서 설정을 저장하지 못했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/marketing/proposal')
    return { success: true }
  })
