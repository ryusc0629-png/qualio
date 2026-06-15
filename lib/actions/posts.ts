'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generatePostContent, generateTopicSuggestions } from '@/lib/ai/geo-content'
import { revalidatePath } from 'next/cache'
import { getAutoPostLimit, getAutoDailyPostLimit } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

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
    topic: z.string().max(300).optional(),
    imageUrl: z.string().url().optional(),
    suggestedTitle: z.string().max(200).optional(), // 추천 카드 제목 고정용
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

    // 추천 카드에서 발행한 경우 → 기획 단계 제목 그대로 사용
    if (parsedInput.suggestedTitle) {
      postContent.title = parsedInput.suggestedTitle
    }

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

// 월간 자동 발행 목표 설정 액션 — 플랜 한도 서버 검증 포함
export const setMonthlyTargetAction = action
  .schema(z.object({
    target: z.number().int().min(0).max(60),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    // 현재 구독 플랜 조회 → 한도 확인
    const { data: sub } = await db
      .from('subscriptions')
      .select('plan')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .maybeSingle()

    const planId = ((sub?.plan as PlanId) ?? 'beta')
    const limit = getAutoPostLimit(planId)

    if (parsedInput.target > limit) {
      throw new Error(`[APP] 현재 플랜(${planId})에서는 최대 월 ${limit}건까지 설정할 수 있어요`)
    }

    const { error } = await db
      .from('businesses')
      .update({ monthly_post_target: parsedInput.target })
      .eq('id', businessId)

    if (error) throw new Error('[APP] 설정 저장에 실패했습니다')

    revalidatePath('/dashboard/marketing')
    return { success: true, limit }
  })

// 오늘 자동 발행 수동 트리거 — "지금 발행" 버튼용
// Cron과 동일한 로직, 세션 인증으로 현재 업체만 실행
export const publishTodayAction = action
  .schema(z.object({}))
  .action(async () => {
    const { db, businessId } = await getBusinessId()

    const now = new Date()
    const year = now.getUTCFullYear()
    const month = now.getUTCMonth() + 1
    const dayOfMonth = now.getUTCDate()
    const daysInMonth = new Date(year, month, 0).getDate()

    // 플랜 한도 조회
    const { data: sub } = await db
      .from('subscriptions')
      .select('plan')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .maybeSingle()

    const planId = ((sub?.plan as PlanId) ?? 'beta')
    const planLimit = getAutoPostLimit(planId)
    const dailyLimit = getAutoDailyPostLimit(planId)

    // 달력 월 기준 발행 건수 집계
    const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString()

    const { count } = await db
      .from('biz_posts')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('published', true)
      .gte('published_at', monthStart)

    const postsThisMonth = count ?? 0

    // 오늘까지 발행됐어야 할 누적 건수 + 일 한도 cap
    const expectedSoFar = Math.floor(planLimit * dayOfMonth / daysInMonth)
    const needed = Math.min(Math.max(0, expectedSoFar - postsThisMonth), dailyLimit)

    if (needed === 0) {
      return { success: true, published: 0, message: '오늘 발행할 포스트가 없어요 (이미 목표 달성)' }
    }

    // 업체 정보 + 서비스 조회
    const [businessResult, servicesResult] = await Promise.all([
      db.from('businesses').select('name, address, description').eq('id', businessId).maybeSingle(),
      db.from('service_items').select('name, base_price, unit')
        .eq('business_id', businessId).eq('is_active', true).is('deleted_at', null),
    ])

    if (!businessResult.data) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const business = businessResult.data
    const services = servicesResult.data ?? []

    // 이번 달 발행 제목 목록 (중복 방지)
    const { data: publishedThisMonth } = await db
      .from('biz_posts')
      .select('title')
      .eq('business_id', businessId)
      .gte('published_at', monthStart)
    const publishedTitles = (publishedThisMonth ?? []).map((p) => p.title)

    const titles: string[] = []

    for (let i = 0; i < needed; i++) {
      // 주제 추천
      let topic: string | undefined
      try {
        const suggestions = await generateTopicSuggestions({
          businessName: business.name,
          services,
          currentMonth: month,
        })
        const unused = suggestions.find(
          (s) => !publishedTitles.some((t) => t.includes(s.title.slice(0, 10)))
        )
        topic = unused?.topic ?? suggestions[0]?.topic
      } catch { /* 주제 추천 실패 시 AI 자유 선택 */ }

      const postContent = await generatePostContent({
        businessName: business.name,
        address: business.address,
        description: business.description,
        services,
        topic,
      })

      // slug 중복 방지
      const baseSlug = postContent.slug
      let slug = baseSlug
      const { data: existing } = await db
        .from('biz_posts').select('slug')
        .eq('business_id', businessId).eq('slug', slug).maybeSingle()
      if (existing) slug = `${baseSlug}-${Date.now().toString(36)}`

      const metaBlock = (postContent.keyPoints?.length || postContent.faqs?.length)
        ? `\`\`\`json\n${JSON.stringify({ keyPoints: postContent.keyPoints ?? [], faqs: postContent.faqs ?? [] })}\n\`\`\`\n`
        : ''

      const { error } = await db.from('biz_posts').insert({
        business_id: businessId,
        slug,
        title: postContent.title,
        content: metaBlock + postContent.content,
        summary: postContent.summary,
        ai_generated: true,
        published: true,
      })

      if (error) throw new Error('[APP] 포스트 저장에 실패했습니다')

      publishedTitles.push(postContent.title)
      titles.push(postContent.title)
    }

    revalidatePath('/dashboard/marketing')
    return { success: true, published: needed, titles }
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
