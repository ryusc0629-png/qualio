'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateSlug } from '@/lib/ai/geo-content'
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
  instagram_url:             z.string().max(300).optional(),
  service_areas:             z.string().max(500).optional(), // 쉼표 구분 지역명

  review_reward_type:        z.string().max(20).optional(),
  review_reward_description: z.string().max(200).optional(),
  // 웹사이트 브랜드 커스터마이징 — 빈 문자열은 "미설정"으로 처리
  brand_color: z
    .string()
    .refine((v) => v === '' || /^#[0-9a-fA-F]{6}$/.test(v), '색상은 #RRGGBB 형식이어야 합니다')
    .optional(),
  brand_color_secondary: z
    .string()
    .refine((v) => v === '' || /^#[0-9a-fA-F]{6}$/.test(v), '색상은 #RRGGBB 형식이어야 합니다')
    .optional(),
  hero_style: z
    .string()
    .refine((v) => ['dark', 'light'].includes(v), '유효하지 않은 히어로 스타일입니다')
    .optional(),
  logo_url:         z.string().max(500).optional(),
  hero_image_url:   z.string().max(500).optional(),
  hero_title:       z.string().max(30).optional(),
  hero_subtitle:    z.string().max(100).optional(),
  testimonials:   z.string().optional(), // JSON string: [{quote, author}]
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

    // 홈페이지 주소(slug)가 아직 없으면 자동 생성 —
    // 색상/문구(브랜드 디자인)만 저장해도 공개 홈페이지(/biz/[slug])가 살아있도록.
    // slug가 없으면 미리보기가 홈페이지 대신 견적 폼(/q/...)으로 빠지는 문제 방지.
    const { data: bizRow } = await db
      .from('businesses')
      .select('slug')
      .eq('id', profile.business_id)
      .maybeSingle()

    let newSlug: string | null = null
    if (!bizRow?.slug) {
      let candidate = generateSlug(parsedInput.name, Math.random().toString(36).slice(2, 7))
      // 혹시 같은 slug가 이미 있으면 다른 suffix로 한 번 더 시도
      const { data: dup } = await db
        .from('businesses')
        .select('id')
        .eq('slug', candidate)
        .maybeSingle()
      if (dup) candidate = generateSlug(parsedInput.name, Math.random().toString(36).slice(2, 7))
      newSlug = candidate
    }

    const { error } = await db
      .from('businesses')
      .update({
        ...(newSlug ? { slug: newSlug } : {}),
        name:             parsedInput.name,
        phone:            parsedInput.phone || null,
        address:          parsedInput.address || null,
        description:     parsedInput.description || null,
        naver_place_url:           parsedInput.naver_place_url           || null,
        google_place_url:          parsedInput.google_place_url          || null,
        danggeun_review_url:       (parsedInput.danggeun_review_url       || null) as never,
        kakao_place_url:           (parsedInput.kakao_place_url           || null) as never,
        active_review_platform:    (parsedInput.active_review_platform    || 'naver') as never,
        youtube_url:               parsedInput.youtube_url               || null,
        instagram_url:             (parsedInput.instagram_url             || null) as never,
        service_areas:             (parsedInput.service_areas
          ? parsedInput.service_areas.split(',').map((s) => s.trim()).filter(Boolean)
          : []) as never,
        review_reward_type:        parsedInput.review_reward_type        || 'none',
        review_reward_description: parsedInput.review_reward_description || null,
        brand_color:               parsedInput.brand_color           || null,
        brand_color_secondary:     parsedInput.brand_color_secondary || null,
        hero_style:                parsedInput.hero_style            || 'dark',
        logo_url:                  parsedInput.logo_url              || null,
        hero_image_url:            (parsedInput.hero_image_url        || null) as never,
        hero_title:                (parsedInput.hero_title            || null) as never,
        hero_subtitle:             (parsedInput.hero_subtitle         || null) as never,
        testimonials:              (parsedInput.testimonials
          ? JSON.parse(parsedInput.testimonials)
          : []) as never,
      })
      .eq('id', profile.business_id)

    if (error) throw new Error('[APP] 설정 저장에 실패했습니다')

    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard', 'layout')
    // 확정된 홈페이지 주소(slug)를 함께 반환 — 저장 직후 미리보기 잠금을 바로 풀기 위함
    return { success: true, slug: newSlug ?? bizRow?.slug ?? null }
  })
