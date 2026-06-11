'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateGeoContent, generateSlug } from '@/lib/ai/geo-content'
import { revalidatePath } from 'next/cache'

// GEO 콘텐츠 자동 생성 액션
export const generateGeoContentAction = action
  .schema(z.object({}))
  .action(async () => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    // 업체 정보 + 서비스 목록 조회
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const [businessResult, servicesResult] = await Promise.all([
      db
        .from('businesses')
        .select('id, name, address, description, slug')
        .eq('id', profile.business_id)
        .maybeSingle(),
      db
        .from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', profile.business_id)
        .eq('is_active', true)
        .is('deleted_at', null),
    ])

    if (!businessResult.data) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const business = businessResult.data
    const services = servicesResult.data ?? []

    // AI GEO 콘텐츠 생성
    const geoContent = await generateGeoContent({
      businessName: business.name,
      address: business.address,
      description: business.description,
      services,
    })

    // slug가 없으면 자동 생성
    let slug = business.slug
    if (!slug) {
      const suffix = Math.random().toString(36).slice(2, 7)
      slug = generateSlug(business.name, suffix)

      // slug 중복 체크 후 저장
      const { data: existing } = await db
        .from('businesses')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (existing) {
        slug = generateSlug(business.name, Math.random().toString(36).slice(2, 7))
      }
    }

    // DB 업데이트
    const { error } = await db
      .from('businesses')
      .update({
        slug,
        seo_title:       geoContent.seoTitle,
        seo_description: geoContent.seoDescription,
        seo_keywords:    geoContent.seoKeywords,
        seo_faqs:        geoContent.faqs as unknown as import('@/lib/types/database').Json,
        seo_generated_at: new Date().toISOString(),
      })
      .eq('id', profile.business_id)

    if (error) throw new Error('[APP] GEO 콘텐츠 저장에 실패했습니다')

    revalidatePath('/dashboard/settings')
    revalidatePath(`/biz/${slug}`)

    return { success: true, slug, geoContent }
  })

// slug 수동 변경 액션
export const updateSlugAction = action
  .schema(
    z.object({
      slug: z
        .string()
        .min(3, 'slug는 3자 이상이어야 합니다')
        .max(60, 'slug는 60자 이하여야 합니다')
        .refine(
          (v) => /^[a-z0-9가-힣][a-z0-9가-힣-]*[a-z0-9가-힣]$/.test(v),
          '영문 소문자, 숫자, 한글, 하이픈만 사용 가능합니다 (앞뒤 하이픈 불가)'
        ),
    })
  )
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

    // slug 중복 확인
    const { data: existing } = await db
      .from('businesses')
      .select('id')
      .eq('slug', parsedInput.slug)
      .neq('id', profile.business_id)
      .maybeSingle()

    if (existing) throw new Error('[APP] 이미 사용 중인 주소입니다. 다른 주소를 입력해주세요')

    const { error } = await db
      .from('businesses')
      .update({ slug: parsedInput.slug })
      .eq('id', profile.business_id)

    if (error) throw new Error('[APP] 주소 변경에 실패했습니다')

    revalidatePath('/dashboard/settings')
    return { success: true }
  })
