'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// 한국 전화번호 검증 (빈 문자열 허용 — 선택 입력)
const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

const updateBusinessSchema = z.object({
  name: z.string().min(2, '업체명은 2자 이상이어야 합니다'),
  phone: z
    .string()
    .transform((val) => val.replace(/-/g, ''))
    .refine((val) => val === '' || phoneRegex.test(val), '올바른 전화번호 형식이 아닙니다')
    .optional(),
  address: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  naver_place_url:           z.string().max(300).optional(),
  google_place_url:          z.string().max(300).optional(),
  danggeun_review_url:       z.string().max(300).optional(),
  kakao_place_url:           z.string().max(300).optional(),
  active_review_platform:    z.string().max(20).optional(),
  youtube_url:               z.string().max(300).optional(),
  review_reward_type:        z.string().max(20).optional(),
  review_reward_description: z.string().max(200).optional(),
})

export const updateBusinessAction = action
  .schema(updateBusinessSchema)
  .action(async ({ parsedInput }) => {
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

    const { error } = await db
      .from('businesses')
      .update({
        name:             parsedInput.name,
        phone:            parsedInput.phone || null,
        address:          parsedInput.address || null,
        description:     parsedInput.description || null,
        naver_place_url:           parsedInput.naver_place_url           || null,
        google_place_url:          parsedInput.google_place_url          || null,
        danggeun_review_url:       parsedInput.danggeun_review_url       || null,
        kakao_place_url:           parsedInput.kakao_place_url           || null,
        active_review_platform:    parsedInput.active_review_platform    || 'naver',
        youtube_url:               parsedInput.youtube_url               || null,
        review_reward_type:        parsedInput.review_reward_type        || 'none',
        review_reward_description: parsedInput.review_reward_description || null,
      })
      .eq('id', profile.business_id)

    if (error) throw new Error('[APP] 설정 저장에 실패했습니다')

    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard', 'layout')
    return { success: true }
  })
