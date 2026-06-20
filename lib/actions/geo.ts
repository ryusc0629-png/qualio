'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateGeoContent, generateSlug } from '@/lib/ai/geo-content'
import { pingIndexNow } from '@/lib/seo/indexnow'
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

    const newSlug = parsedInput.slug

    // 다른 업체가 현재 쓰는 주소거나, 다른 업체의 옛 주소(리다이렉트 대상)면 거절
    const { data: takenAsCurrent } = await db
      .from('businesses')
      .select('id')
      .eq('slug', newSlug)
      .neq('id', profile.business_id)
      .maybeSingle()
    const { data: takenAsPrevious } = await db
      .from('businesses')
      .select('id')
      .contains('previous_slugs' as never, [newSlug] as never)
      .neq('id', profile.business_id)
      .maybeSingle()
    if (takenAsCurrent || takenAsPrevious) {
      throw new Error('[APP] 이미 사용 중인 주소입니다. 다른 주소를 입력해주세요')
    }

    // 현재 주소·옛 주소 목록 조회 (옛 주소를 보존해 기존 링크가 안 깨지게)
    const { data: current } = await db
      .from('businesses')
      .select('slug, previous_slugs' as never)
      .eq('id', profile.business_id)
      .maybeSingle() as unknown as { data: { slug: string | null; previous_slugs: string[] | null } | null }

    const oldSlug = current?.slug ?? null
    if (oldSlug === newSlug) return { success: true } // 변화 없음

    // 옛 주소를 previous_slugs에 누적(중복 제거), 새 주소가 들어 있으면 제거
    const prev = new Set(current?.previous_slugs ?? [])
    prev.delete(newSlug)
    if (oldSlug) prev.add(oldSlug)

    const { error } = await db
      .from('businesses')
      .update({ slug: newSlug, previous_slugs: [...prev] } as never)
      .eq('id', profile.business_id)

    if (error) throw new Error('[APP] 주소 변경에 실패했습니다')

    // 새 주소를 네이버·빙에 즉시 알림 (옛 주소는 301로 새 주소를 가리킴)
    await pingIndexNow([`/biz/${newSlug}`, ...(oldSlug ? [`/biz/${oldSlug}`] : [])])

    revalidatePath('/dashboard/settings')
    revalidatePath(`/biz/${newSlug}`)
    if (oldSlug) revalidatePath(`/biz/${oldSlug}`)
    return { success: true }
  })
