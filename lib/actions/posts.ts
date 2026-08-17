'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generatePostContent, generateTopicSuggestions, type TopicSuggestion } from '@/lib/ai/geo-content'
import { revalidatePath } from 'next/cache'
import { notifyIndexNowForPosts } from '@/lib/seo/indexnow'
import { getAutoPostLimit, getAutoDailyPostLimit, getPostModel, isChannelContentEnabled } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { fetchRecentJobCases, fetchRecentCasePhotos, POST_PHOTO_COUNT } from '@/lib/ai/job-cases'
import { generateAndSaveChannelContent } from '@/lib/ai/channel-content'
import { getOrCreatePostPlan, pickTodayPlanSlot } from '@/lib/geo/post-plan'
import { getRelatedKeywords } from '@/lib/keyword/naver-searchad'
import { consumeDailyQuota, getDailyUsage, POST_DRAFT_SCOPE, POST_DRAFT_DAILY_LIMIT } from '@/lib/ratelimit/daily-quota'

// 한도를 1회 차감하고, 다 썼으면 사장님이 이해할 수 있는 문구로 막는다.
async function spendPostDraftQuota(db: Parameters<typeof consumeDailyQuota>[0], businessId: string) {
  const allowed = await consumeDailyQuota(db, POST_DRAFT_SCOPE, businessId, POST_DRAFT_DAILY_LIMIT)
  if (!allowed) {
    throw new Error(
      `[APP] 오늘은 글을 ${POST_DRAFT_DAILY_LIMIT}편까지 만들 수 있어요. 내일 다시 만들 수 있습니다`,
    )
  }
}

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
    keyword: z.string().max(100).optional(), // 추천 주제의 핵심 검색어 (본문·태그 최적화용)
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    await spendPostDraftQuota(db, businessId)

    // 업체 정보 + 서비스 + 구독 플랜 조회
    const [businessResult, servicesResult, subResult] = await Promise.all([
      db
        .from('businesses')
        .select('name, address, description, service_areas, slug' as never)
        .eq('id', businessId)
        .maybeSingle() as unknown as Promise<{ data: { name: string; address: string | null; description: string | null; service_areas: string[] | null; slug: string | null } | null }>,
      db
        .from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .is('deleted_at', null),
      db
        .from('subscriptions')
        .select('plan')
        .eq('business_id', businessId)
        .eq('status', 'active')
        .maybeSingle(),
    ])

    if (!businessResult.data) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const business = businessResult.data
    const services = servicesResult.data ?? []
    // 플랜별 능력 — 심층 글 모델 / SNS 채널 원고 포함 여부
    const planId = ((subResult.data?.plan as PlanId) ?? 'beta')
    const model = getPostModel(planId)
    const channelsEnabled = isChannelContentEnabled(planId)
    // 실제 작업 사례(익명) — 글 고유성 근거
    const realCases = await fetchRecentJobCases(db, businessId)

    // 핵심 검색어가 있으면 연관 검색어까지 조회 → 본문·태그를 실제 검색어에 맞춤
    const keyword = parsedInput.keyword
    const relatedStats = keyword ? await getRelatedKeywords(keyword) : []
    const relatedKeywords = relatedStats.map((r) => r.keyword)
    const seoKeywords = keyword ? [keyword, ...relatedKeywords] : undefined

    // AI 포스트 생성
    const postContent = await generatePostContent({
      businessName: business.name,
      address: business.address,
      description: business.description,
      services,
      topic: parsedInput.topic,
      imageUrl: parsedInput.imageUrl,
      serviceAreas: business.service_areas,
      model,
      realCases,
      keyword,
      relatedKeywords,
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

    // 이미지 — 공개 승인된 작업보고의 진짜 비포/애프터 사진만 싣는다(자동발행과 동일 규칙).
    // 실사진이 없으면 사진 없이 글만 나간다 — 사진은 글별 '수정'에서 직접 올릴 수 있다.
    const casePhotos = await fetchRecentCasePhotos(db, businessId)
    const imageUrls = [...casePhotos.before, ...casePhotos.after].slice(0, POST_PHOTO_COUNT)
    // 대표 이미지(커버)는 '결과'가 드러나는 애프터 사진을 우선 — 눈길을 끄는 게 애프터라서.
    const coverUrl = casePhotos.after[0] ?? imageUrls[0] ?? null

    // DB 저장
    const { data: post, error } = await db
      .from('biz_posts')
      .insert({
        business_id: businessId,
        slug,
        title: postContent.title,
        content: fullContent,
        summary: postContent.summary,
        image_url: coverUrl,
        image_urls: imageUrls,
        ai_generated: true,
        published: true,
      })
      .select('id, slug')
      .single()

    if (error) throw new Error('[APP] 포스트 저장에 실패했습니다')

    // 네이버·당근·인스타 채널 텍스트 자동 생성 (플랜에 포함된 경우만, 실패해도 GEO 발행은 유지)
    if (channelsEnabled) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
      await generateAndSaveChannelContent(db, post.id, {
        businessName: business.name,
        address: business.address,
        geoTitle: postContent.title,
        geoContent: fullContent,
        seoKeywords,
        // 견적 링크는 슬러그(깔끔) 우선, 없으면 UUID 폴백 — 둘 다 /q 라우트가 처리
        quoteBaseUrl: `${appUrl}/q/${business.slug ?? businessId}`,
      })
    }

    // 네이버·빙에 새 글 색인 알림 (빠른 검색 노출)
    await notifyIndexNowForPosts(db, businessId, [post.slug])

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
    imageUrls: z.array(z.string().url()).optional(),
    beforeImageUrls: z.array(z.string().url()).optional(),
    afterImageUrls: z.array(z.string().url()).optional(),
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
      const updateData = {
        title: parsedInput.title,
        content: parsedInput.content,
        summary: parsedInput.summary ?? null,
        published: parsedInput.published,
      } as Record<string, unknown>

      if (parsedInput.imageUrls) {
        updateData.image_urls = parsedInput.imageUrls
        updateData.image_url = parsedInput.imageUrls[0] ?? null
      } else if (parsedInput.imageUrl) {
        updateData.image_url = parsedInput.imageUrl
      }
      if (parsedInput.beforeImageUrls !== undefined) {
        updateData.before_image_urls = parsedInput.beforeImageUrls
      }
      if (parsedInput.afterImageUrls !== undefined) {
        updateData.after_image_urls = parsedInput.afterImageUrls
        if (!parsedInput.imageUrls) {
          updateData.image_url = parsedInput.afterImageUrls[0] ?? null
        }
      }

      const { error } = await db
        .from('biz_posts' as never)
        .update(updateData as never)
        .eq('id' as never, parsedInput.id)
        .eq('business_id' as never, businessId)

      if (error) throw new Error('[APP] 포스트 수정에 실패했습니다')

      // 발행 상태면 색인 알림 (slug는 id로 조회)
      if (parsedInput.published) {
        const { data: row } = await db
          .from('biz_posts' as never)
          .select('slug' as never)
          .eq('id' as never, parsedInput.id)
          .maybeSingle() as unknown as { data: { slug: string } | null }
        if (row?.slug) await notifyIndexNowForPosts(db, businessId, [row.slug])
      }
    } else {
      const slug = `${baseSlug}-${suffix}`
      const imgs = parsedInput.imageUrls ?? []
      const afterImgs = parsedInput.afterImageUrls ?? []
      const { error } = await db
        .from('biz_posts' as never)
        .insert({
          business_id: businessId,
          slug,
          title: parsedInput.title,
          content: parsedInput.content,
          summary: parsedInput.summary ?? null,
          image_url: imgs[0] ?? afterImgs[0] ?? parsedInput.imageUrl ?? null,
          image_urls: imgs.length > 0 ? imgs : undefined,
          before_image_urls: parsedInput.beforeImageUrls?.length ? parsedInput.beforeImageUrls : undefined,
          after_image_urls: afterImgs.length > 0 ? afterImgs : undefined,
          published: parsedInput.published,
          ai_generated: false,
        } as never)

      if (error) throw new Error('[APP] 포스트 저장에 실패했습니다')

      // 발행 상태면 색인 알림
      if (parsedInput.published) await notifyIndexNowForPosts(db, businessId, [slug])
    }

    revalidatePath('/dashboard/marketing')
    return { success: true }
  })

// 현장 메모 + 사진 → 읽기 좋은 글 초안 생성 (저장 안 함, 편집기에서 검토 후 저장)
// 사장님이 사진 올리고 아무렇게나 메모하면, 사진을 보고 전문가 톤으로 다듬어 초안을 만들어 준다.
export const generatePostFromNotesAction = action
  .schema(z.object({
    notes: z.string().min(1, '현장 메모를 입력해주세요').max(2000),
    imageUrls: z.array(z.string().url()).max(10).optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    await spendPostDraftQuota(db, businessId)

    const [businessResult, servicesResult, subResult] = await Promise.all([
      db
        .from('businesses')
        .select('name, address, description, service_areas' as never)
        .eq('id', businessId)
        .maybeSingle() as unknown as Promise<{ data: { name: string; address: string | null; description: string | null; service_areas: string[] | null } | null }>,
      db
        .from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .is('deleted_at', null),
      db
        .from('subscriptions')
        .select('plan')
        .eq('business_id', businessId)
        .eq('status', 'active')
        .maybeSingle(),
    ])

    if (!businessResult.data) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const business = businessResult.data
    const services = servicesResult.data ?? []
    const planId = ((subResult.data?.plan as PlanId) ?? 'beta')
    const model = getPostModel(planId)

    // 사진(비전) + 메모를 핵심 재료로 초안 작성 — 저장·이미지 자동생성은 하지 않음(실사진 사용)
    const postContent = await generatePostContent({
      businessName: business.name,
      address: business.address,
      description: business.description,
      services,
      fieldNotes: parsedInput.notes,
      imageUrls: parsedInput.imageUrls,
      serviceAreas: business.service_areas,
      model,
    })

    // 남은 횟수를 함께 돌려줘 편집기가 새로고침 없이 "오늘 n번 남음"을 갱신하게 한다
    const usedToday = await getDailyUsage(db, POST_DRAFT_SCOPE, businessId)

    return {
      success: true,
      title: postContent.title,
      summary: postContent.summary,
      content: postContent.content,
      remainingToday: Math.max(0, POST_DRAFT_DAILY_LIMIT - usedToday),
      dailyLimit: POST_DRAFT_DAILY_LIMIT,
    }
  })

// 이번 달 인기 주제 추천 액션
export const getTopicSuggestionsAction = action
  .schema(z.object({}))
  .action(async () => {
    const { db, businessId } = await getBusinessId()

    // 이번 달 키 'YYYY-MM' — 저장된 달이 이번 달과 같으면 AI를 다시 부르지 않고 재사용
    // Vercel은 UTC라 월말/월초 경계에서 밀리지 않도록 KST 기준으로 월을 계산
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const monthKey = `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth() + 1).padStart(2, '0')}`

    const [businessResult, servicesResult] = await Promise.all([
      db
        .from('businesses')
        .select('name, address, topic_suggestions, topic_suggestions_month' as never)
        .eq('id', businessId)
        .maybeSingle() as unknown as Promise<{
          data: {
            name: string
            address: string | null
            topic_suggestions: TopicSuggestion[] | null
            topic_suggestions_month: string | null
          } | null
        }>,
      db
        .from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .is('deleted_at', null),
    ])

    if (!businessResult.data) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // 이번 달에 이미 생성된 주제가 있으면 그대로 반환 (토큰 소모 없음)
    const saved = businessResult.data.topic_suggestions
    if (
      businessResult.data.topic_suggestions_month === monthKey &&
      Array.isArray(saved) &&
      saved.length > 0
    ) {
      return { suggestions: saved }
    }

    // 이번 달 첫 요청 — AI로 생성한 뒤 DB에 고정 저장
    const suggestions = await generateTopicSuggestions({
      businessName: businessResult.data.name,
      services: servicesResult.data ?? [],
      currentMonth: nowKST.getUTCMonth() + 1,
      address: businessResult.data.address,
    })

    await db
      .from('businesses')
      .update({
        topic_suggestions: suggestions,
        topic_suggestions_month: monthKey,
      } as never)
      .eq('id', businessId)

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

    // KST 기준 오늘 — 고정 계획표는 KST '일'을 기준으로 슬롯을 잡는다
    const todayKSTStr = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const monthKST = todayKSTStr.slice(0, 7)
    const todayDayKST = Number(todayKSTStr.slice(8, 10))
    const daysInMonthKST = new Date(Number(todayKSTStr.slice(0, 4)), Number(todayKSTStr.slice(5, 7)), 0).getDate()

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
    // 플랜별 능력 — 심층 글 모델 / SNS 채널 원고 포함 여부
    const model = getPostModel(planId)
    const channelsEnabled = isChannelContentEnabled(planId)

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

    // 중복 발행 방지 락 — 원자적 조건부 업데이트(락 없음 또는 만료된 경우에만 획득).
    // 딜레이 중 버튼을 두 번 누르거나 새로고침 후 다시 눌러도, 두 번째 요청은 여기서 막힌다.
    // 락은 3분 뒤 자동 만료 → 도중에 프로세스가 죽어도 스스로 풀린다.
    const nowIso = new Date().toISOString()
    const lockUntilIso = new Date(Date.now() + 3 * 60 * 1000).toISOString()
    const { data: lockRow } = await db
      .from('businesses')
      .update({ auto_post_lock_until: lockUntilIso } as never)
      .eq('id', businessId)
      .or(`auto_post_lock_until.is.null,auto_post_lock_until.lt.${nowIso}`)
      .select('id')
      .maybeSingle()
    if (!lockRow) {
      return { success: true, published: 0, message: '이미 홍보 글을 작성 중이에요. 1~2분쯤 걸리니 잠시만 기다려 주세요' }
    }

    try {
    // 업체 정보 + 서비스 조회
    const [businessResult, servicesResult] = await Promise.all([
      db.from('businesses').select('name, address, description, service_areas, monthly_post_target' as never).eq('id', businessId).maybeSingle() as unknown as Promise<{ data: { name: string; address: string | null; description: string | null; service_areas: string[] | null; monthly_post_target: number } | null }>,
      db.from('service_items').select('name, base_price, unit')
        .eq('business_id', businessId).eq('is_active', true).is('deleted_at', null),
    ])

    if (!businessResult.data) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const business = businessResult.data
    const services = servicesResult.data ?? []

    // 이번 달 발행 제목 + 발행일(KST) — 중복 방지 및 계획표 슬롯 매칭용
    const { data: publishedThisMonth } = await db
      .from('biz_posts')
      .select('title, published_at, post_type' as never)
      .eq('business_id', businessId)
      .gte('published_at', monthStart) as unknown as { data: { title: string; published_at: string; post_type: string | null }[] | null }
    const publishedTitles = (publishedThisMonth ?? []).map((p) => p.title)
    const publishedDays = new Set<number>(
      (publishedThisMonth ?? [])
        .filter((p) => p.post_type !== 'portfolio')
        .map((p) => Number(new Date(new Date(p.published_at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(8, 10)))
    )

    // 고정 계획표에서 오늘 발행할 슬롯을 가져온다(달력·크론과 동일한 주제).
    const plan = await getOrCreatePostPlan(db, businessId, {
      month: monthKST,
      currentMonthNum: Number(monthKST.slice(5, 7)),
      daysInMonth: daysInMonthKST,
      today: todayDayKST,
      target: Math.min(business.monthly_post_target ?? planLimit, planLimit),
      businessName: business.name,
      address: business.address,
      publishedDays,
    })
    const todaySlot = pickTodayPlanSlot(plan, todayDayKST, publishedDays)

    const titles: string[] = []
    const publishedSlugs: string[] = []

    // 실제 작업 사례(익명) — 글 고유성 근거 (1회 조회)
    const realCases = await fetchRecentJobCases(db, businessId)

    for (let i = 0; i < needed; i++) {
      // 주제 선택 — 무조건 고정 계획표의 오늘 슬롯을 그대로 따른다(달력과 100% 일치).
      let topic: string | undefined = todaySlot?.topic || undefined
      let keyword: string | undefined = todaySlot?.keyword ?? undefined

      // 폴백: 계획 슬롯이 없을 때만(측정 전·목표 변경 등) 월간 추천에서 선택
      if (!topic) {
        try {
          const suggestions = await generateTopicSuggestions({
            businessName: business.name,
            services,
            currentMonth: month,
            address: business.address,
            skipKeywordData: true, // 발행 경로: 검색량 배지 불필요 → 네이버 API 생략
          })
          const unused = suggestions.find(
            (s) => !publishedTitles.some((t) => t.includes(s.title.slice(0, 10)))
          )
          topic = unused?.topic ?? suggestions[0]?.topic
          keyword = unused?.keyword ?? suggestions[0]?.keyword
        } catch { /* 주제 추천 실패 시 AI 자유 선택 */ }
      }

      // 핵심 검색어 연관어까지 조회 → 본문·태그를 실제 검색어에 맞춤
      const relatedStats = keyword ? await getRelatedKeywords(keyword) : []
      const relatedKeywords = relatedStats.map((r) => r.keyword)
      const seoKeywords = keyword ? [keyword, ...relatedKeywords] : undefined

      const postContent = await generatePostContent({
        businessName: business.name,
        address: business.address,
        description: business.description,
        services,
        topic,
        serviceAreas: business.service_areas,
        model,
        realCases,
        keyword,
        relatedKeywords,
        titleOverride: todaySlot?.label, // 계획표에 확정된 제목 그대로 발행(달력과 일치)
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

      const fullContent = metaBlock + postContent.content

      // 이미지 — 공개 승인된 작업보고의 진짜 비포/애프터 사진만 싣는다(없으면 사진 없이 발행)
      const casePhotos = await fetchRecentCasePhotos(db, businessId)
      const imageUrls = [...casePhotos.before, ...casePhotos.after].slice(0, POST_PHOTO_COUNT)

      const { data: savedPost, error } = await db.from('biz_posts').insert({
        business_id: businessId,
        slug,
        title: postContent.title,
        content: fullContent,
        summary: postContent.summary,
        image_url: casePhotos.after[0] ?? imageUrls[0] ?? null,
        image_urls: imageUrls,
        ai_generated: true,
        published: true,
      }).select('id').single()

      if (error) throw new Error('[APP] 포스트 저장에 실패했습니다')

      // 네이버·당근·인스타 채널 텍스트 자동 생성 (플랜에 포함된 경우만, 실패해도 GEO 발행은 유지)
      if (channelsEnabled && savedPost?.id) {
        await generateAndSaveChannelContent(db, savedPost.id, {
          businessName: business.name,
          address: business.address,
          geoTitle: postContent.title,
          geoContent: fullContent,
          seoKeywords,
        })
      }

      publishedTitles.push(postContent.title)
      titles.push(postContent.title)
      publishedSlugs.push(slug)
    }

    // 네이버·빙에 새 글 색인 알림 (빠른 검색 노출)
    await notifyIndexNowForPosts(db, businessId, publishedSlugs)

    revalidatePath('/dashboard/marketing')
    return { success: true, published: needed, titles }
    } finally {
      // 발행 성공/실패와 무관하게 락 해제 (예외 시에도 반드시 풀림)
      await db.from('businesses').update({ auto_post_lock_until: null } as never).eq('id', businessId)
    }
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

// 채널(네이버/당근/인스타) 수동 업로드 완료 처리 — 작업 목록에서 사라지게 함
export const markChannelsPostedAction = action
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db
      .from('biz_posts' as never)
      .update({ channel_posted_at: new Date().toISOString() } as never)
      .eq('id' as never, parsedInput.id)
      .eq('business_id' as never, businessId)

    if (error) throw new Error('[APP] 완료 처리에 실패했습니다')

    revalidatePath('/dashboard/marketing')
    revalidatePath('/dashboard', 'layout')
    return { success: true }
  })
