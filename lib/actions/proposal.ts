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
const DESIGNS = ['classic', 'photo', 'clean', 'bold']

const statSchema = z.object({
  value: z.string().max(10),
  unit: z.string().max(10),
  label: z.string().max(60),
})

// 사진은 우리 스토리지/업로드 URL만 받는다(빈 문자열 = 자동 선택으로 되돌리기)
const photoUrl = z.string().max(600).optional()

const saveProposalSchema = z.object({
  category: z.string().refine((v) => CATEGORIES.includes(v), '유효하지 않은 카테고리입니다'),
  theme: z.string().refine((v) => THEMES.includes(v), '유효하지 않은 테마입니다'),
  design: z.string().refine((v) => DESIGNS.includes(v), '유효하지 않은 템플릿입니다'),
  headline: z.string().max(120).optional(),
  kicker: z.string().max(60).optional(),
  stats: z.array(statSchema).max(3).optional(),
  photos: z
    .object({
      cover: photoUrl,
      investment: photoUrl,
      category: photoUrl,
      owner: photoUrl,
    })
    .optional(),
  sections: z.object({
    owner: z.boolean(),
    pain: z.boolean(),
    investment: z.boolean(),
    services: z.boolean(),
    principles: z.boolean(),
    gallery: z.boolean(),
    refund: z.boolean(),
    process: z.boolean(),
    reviews: z.boolean(),
    trust: z.boolean(),
  }),
})

// 사진 값 정리 — 공백만 있으면 저장 안 함(자동 선택으로 복귀)
function photos_(url: string | undefined): string | undefined {
  const v = (url ?? '').trim()
  return v || undefined
}

// 소개서 설정 저장 — businesses.proposal_settings(jsonb)에 소개서 전용값만 담는다
export const saveProposalSettingsAction = action
  .schema(saveProposalSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthenticatedBusinessId()

    // 빈 문자열은 저장하지 않는다 — 비워두면 홈페이지 사진을 자동으로 쓰는 상태로 돌아간다
    const photos = parsedInput.photos
      ? {
          cover: photos_(parsedInput.photos.cover),
          investment: photos_(parsedInput.photos.investment),
          category: photos_(parsedInput.photos.category),
          owner: photos_(parsedInput.photos.owner),
        }
      : undefined

    const settings: ProposalSettings = {
      template: 'company',
      design: parsedInput.design as ProposalSettings['design'],
      category: parsedInput.category as ProposalSettings['category'],
      theme: parsedInput.theme as ProposalSettings['theme'],
      headline: parsedInput.headline?.trim() || undefined,
      kicker: parsedInput.kicker?.trim() || undefined,
      stats: parsedInput.stats,
      photos,
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
