'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generatePostContent, generateTopicSuggestions } from '@/lib/ai/geo-content'
import { revalidatePath } from 'next/cache'

// 공통: 현재 유저의 business_id 조회
async function getBusinessId() {
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

// AI 포스트 자동 생성 액션
export const generatePostAction = action
  .schema(z.object({
    topic: z.string().max(100).optional(),
    imageUrl: z.string().url().optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    // 업체 정보 + 서비스 조회
    const [businessResult, servicesResult] = await Promise.all([
      db
        .from('businesses')
        .select('name, address, description')
        .eq('id', businessId)
        .maybeSingle(),
      db
        .from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .is('deleted_at', null),
    ])

    if (!businessResult.data) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const business = businessResult.data
    const services = servicesResult.data ?? []

    // AI 포스트 생성
    const postContent = await generatePostContent({
      businessName: business.name,
      address: business.address,
      description: business.description,
      services,
      topic: parsedInput.topic,
      imageUrl: parsedInput.imageUrl,
    })

    // slug 중복 방지 — 같은 slug가 이미 있으면 숫자 붙이기
    const baseSlug = postContent.slug
    let slug = baseSlug
    const { data: existing } = await db
      .from('biz_posts')
      .select('slug')
      .eq('business_id', businessId)
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      slug = `${baseSlug}-${Date.now().toString(36)}`
    }

    // keyPoints/faqs를 content 앞에 JSON 메타 블록으로 저장
    const metaBlock = (postContent.keyPoints?.length || postContent.faqs?.length)
      ? `\`\`\`json\n${JSON.stringify({ keyPoints: postContent.keyPoints ?? [], faqs: postContent.faqs ?? [] })}\n\`\`\`\n`
      : ''
    const fullContent = metaBlock + postContent.content

    // DB 저장
    const { data: post, error } = await db
      .from('biz_posts')
      .insert({
        business_id: businessId,
        slug,
        title: postContent.title,
        content: fullContent,
        summary: postContent.summary,
        ai_generated: true,
        published: true,
      })
      .select('id, slug')
      .single()

    if (error) throw new Error('[APP] 포스트 저장에 실패했습니다')

    revalidatePath('/dashboard/marketing')
    return { success: true, postId: post.id, slug: post.slug, postContent }
  })

// 포스트 수동 저장 액션
export const savePostAction = action
  .schema(z.object({
    id: z.string().uuid().optional(),  // 있으면 수정, 없으면 신규
    title: z.string().min(2, '제목은 2자 이상이어야 합니다').max(100),
    content: z.string().min(10, '내용은 10자 이상이어야 합니다'),
    summary: z.string().max(200).optional(),
    imageUrl: z.string().url().optional().or(z.literal('')),
    published: z.boolean().default(true),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    // slug 생성 (제목 기반)
    const baseSlug = parsedInput.title
      .toLowerCase()
      .replace(/[^\w\uAC00-\uD7A3가-힣\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 50)
    const suffix = Date.now().toString(36)

    if (parsedInput.id) {
      // 수정
      const { error } = await db
        .from('biz_posts')
        .update({
          title: parsedInput.title,
          content: parsedInput.content,
          summary: parsedInput.summary ?? null,
          image_url: parsedInput.imageUrl || null,
          published: parsedInput.published,
        })
        .eq('id', parsedInput.id)
        .eq('business_id', businessId)

      if (error) throw new Error('[APP] 포스트 수정에 실패했습니다')
    } else {
      // 신규
      const slug = `${baseSlug}-${suffix}`
      const { error } = await db
        .from('biz_posts')
        .insert({
          business_id: businessId,
          slug,
          title: parsedInput.title,
          content: parsedInput.content,
          summary: parsedInput.summary ?? null,
          image_url: parsedInput.imageUrl || null,
          published: parsedInput.published,
          ai_generated: false,
        })

      if (error) throw new Error('[APP] 포스트 저장에 실패했습니다')
    }

    revalidatePath('/dashboard/marketing')
    return { success: true }
  })

// 이번 달 인기 주제 추천 액션
export const getTopicSuggestionsAction = action
  .schema(z.object({}))
  .action(async () => {
    const { db, businessId } = await getBusinessId()

    const [businessResult, servicesResult] = await Promise.all([
      db
        .from('businesses')
        .select('name')
        .eq('id', businessId)
        .maybeSingle(),
      db
        .from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .is('deleted_at', null),
    ])

    if (!businessResult.data) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const suggestions = await generateTopicSuggestions({
      businessName: businessResult.data.name,
      services: servicesResult.data ?? [],
      currentMonth: new Date().getMonth() + 1,
    })

    return { suggestions }
  })

// 포스트 삭제 액션
export const deletePostAction = action
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db
      .from('biz_posts')
      .delete()
      .eq('id', parsedInput.id)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 포스트 삭제에 실패했습니다')

    revalidatePath('/dashboard/marketing')
    return { success: true }
  })
