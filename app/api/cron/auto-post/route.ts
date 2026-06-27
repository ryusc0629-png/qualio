import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePostContent, generateTopicSuggestions } from '@/lib/ai/geo-content'
import { fetchRecentJobCases } from '@/lib/ai/job-cases'
import { generatePostImages, POST_IMAGE_COUNT } from '@/lib/ai/image-gen'
import { generateAndSaveChannelContent } from '@/lib/ai/channel-content'
import { notifyIndexNowForPosts } from '@/lib/seo/indexnow'
import { getAutoPostLimit, getAutoDailyPostLimit, getPostModel, isChannelContentEnabled } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

// Vercel Cron: 매일 00:00 UTC (한국 오전 9시) 실행
// 1회 실행 시 오늘 발행해야 할 건수만큼 반복 발행 (스케일 플랜 하루 2건 지원)
// vercel.json에 등록된 cron만 호출 가능 — CRON_SECRET으로 인증

// AI 글 생성 + 이미지 생성을 여러 건 반복하므로 실행 시간을 넉넉히 확보
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// 오늘 발행해야 할 건수 계산 — 달력 월 기준 균등 분포 + 일 한도 cap
function postsToPublishToday(
  postsThisMonth: number,
  target: number,
  dayOfMonth: number,
  daysInMonth: number,
  dailyLimit: number,
): number {
  if (postsThisMonth >= target) return 0
  // 오늘까지 발행됐어야 할 누적 건수
  const expectedSoFar = Math.floor(target * dayOfMonth / daysInMonth)
  const needed = Math.max(0, expectedSoFar - postsThisMonth)
  // 하루 최대 발행 한도 적용
  return Math.min(needed, dailyLimit)
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// 포스트 1건 생성 및 저장
async function publishOnePost(
  db: ReturnType<typeof createServiceClient>,
  business: { id: string; name: string; address: string | null; description: string | null; serviceAreas: string[] | null; autoImageGeneration: boolean },
  services: { name: string; base_price: number; unit: string }[],
  publishedTitles: string[],
  month: number,
  // 플랜별 능력 — 본문 생성 모델, SNS 채널 원고 생성 여부
  model: string,
  channelsEnabled: boolean,
  realCases: string[],
): Promise<string> {
  // AI로 주제 추천
  let selectedTopic: string | undefined
  try {
    const suggestions = await generateTopicSuggestions({
      businessName: business.name,
      services,
      currentMonth: month,
      // 이번 달 이미 발행한 제목(같은 실행 내 직전 발행분 포함) → AI가 유사 주제까지 제외
      recentTitles: publishedTitles,
    })
    const unused = suggestions.find(
      (s) => !publishedTitles.some((t) => t.includes(s.title.slice(0, 10)))
    )
    selectedTopic = unused?.topic ?? suggestions[0]?.topic
  } catch {
    // 주제 추천 실패 시 AI 자유 선택
  }

  const postContent = await generatePostContent({
    businessName: business.name,
    address: business.address,
    description: business.description,
    services,
    topic: selectedTopic,
    serviceAreas: business.serviceAreas,
    model,
    realCases,
  })

  // slug 중복 방지
  const baseSlug = postContent.slug
  let slug = baseSlug
  const { data: existing } = await db
    .from('biz_posts')
    .select('slug')
    .eq('business_id', business.id)
    .eq('slug', slug)
    .maybeSingle()
  if (existing) slug = `${baseSlug}-${Date.now().toString(36)}`

  const metaBlock = (postContent.keyPoints?.length || postContent.faqs?.length)
    ? `\`\`\`json\n${JSON.stringify({ keyPoints: postContent.keyPoints ?? [], faqs: postContent.faqs ?? [] })}\n\`\`\`\n`
    : ''

  // 포스트 주제에 맞는 이미지 자동 생성 (토글 ON일 때만, 실패해도 포스팅 진행)
  const imageUrls = business.autoImageGeneration
    ? await generatePostImages(postContent.imagePrompt || postContent.title, POST_IMAGE_COUNT)
    : []

  const fullContent = metaBlock + postContent.content
  const { data: saved, error } = await db.from('biz_posts').insert({
    business_id: business.id,
    slug,
    title: postContent.title,
    content: fullContent,
    summary: postContent.summary,
    image_url: imageUrls[0] ?? null,
    image_urls: imageUrls,
    ai_generated: true,
    published: true,
  }).select('id').single()

  if (error) throw new Error(error.message)

  // 네이버·당근·인스타 채널 텍스트 자동 생성 (플랜에 포함된 경우만, 실패해도 GEO 발행은 유지)
  if (channelsEnabled && saved?.id) {
    await generateAndSaveChannelContent(db, saved.id, {
      businessName: business.name,
      address: business.address,
      geoTitle: postContent.title,
      geoContent: fullContent,
    })
  }

  // 네이버·빙에 새 글 색인 알림 (빠른 검색 노출)
  await notifyIndexNowForPosts(db, business.id, [slug])

  // 다음 반복에서 중복 방지
  publishedTitles.push(postContent.title)

  return postContent.title
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const dayOfMonth = now.getUTCDate()
  const daysInMonth = getDaysInMonth(year, month)

  const { data: businesses, error: bizError } = await db
    .from('businesses' as never)
    .select('id, name, address, description, service_areas, monthly_post_target, auto_image_generation' as never)
    .gt('monthly_post_target' as never, 0) as unknown as {
      data: { id: string; name: string; address: string | null; description: string | null; service_areas: string[] | null; monthly_post_target: number; auto_image_generation: boolean }[] | null
      error: { message: string } | null
    }

  if (bizError) {
    console.error('[Cron] 업체 조회 실패:', bizError)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!businesses || businesses.length === 0) {
    return NextResponse.json({ message: '자동 발행 업체 없음', processed: 0 })
  }

  const results: { businessId: string; action: string; titles?: string[]; count?: number; error?: string }[] = []

  for (const business of businesses) {
    try {
      const { data: sub } = await db
        .from('subscriptions')
        .select('plan')
        .eq('business_id', business.id)
        .eq('status', 'active')
        .maybeSingle()

      const planId = ((sub?.plan as PlanId) ?? 'beta')
      const planLimit = getAutoPostLimit(planId)
      const dailyLimit = getAutoDailyPostLimit(planId)
      const effectiveTarget = Math.min(business.monthly_post_target, planLimit)

      // 달력 월 기준 발행 건수 집계 — 포트폴리오(시공 사례)는 자동 발행 카운트에서 제외
      const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString()
      const { count } = await db
        .from('biz_posts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .eq('published', true)
        .eq('post_type' as never, 'geo')
        .gte('published_at', monthStart)

      const postsThisMonth = count ?? 0
      const needed = postsToPublishToday(postsThisMonth, effectiveTarget, dayOfMonth, daysInMonth, dailyLimit)

      if (needed === 0) {
        results.push({ businessId: business.id, action: 'skipped' })
        continue
      }

      // 이번 달 발행 제목 목록 (중복 방지용) — AI GEO 글만
      const { data: publishedThisMonth } = await db
        .from('biz_posts')
        .select('title')
        .eq('business_id', business.id)
        .eq('post_type' as never, 'geo')
        .gte('published_at', monthStart)
      const publishedTitles = (publishedThisMonth ?? []).map((p) => p.title)

      const { data: services } = await db
        .from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .not('base_price', 'is', null)
        .not('unit', 'is', null)

      // 오늘 필요한 건수만큼 순차 발행 (AI 주제 추천 방식)
      // 포트폴리오(시공 사례)는 자동 발행에서 제외 — 사장님이 직접 승인해 게시
      // 플랜별 능력 — 심층 글 모델 / SNS 채널 원고 포함 여부
      const model = getPostModel(planId)
      const channelsEnabled = isChannelContentEnabled(planId)
      // 실제 작업 사례(익명) — 글 고유성 근거 (업체당 1회 조회)
      const realCases = await fetchRecentJobCases(db, business.id)

      const publishedTitlesThisRun: string[] = []
      for (let i = 0; i < needed; i++) {
        const title = await publishOnePost(db, { ...business, serviceAreas: business.service_areas, autoImageGeneration: business.auto_image_generation ?? true }, services ?? [], publishedTitles, month, model, channelsEnabled, realCases)
        publishedTitlesThisRun.push(title)
        console.log(`[Cron] 자동 발행 완료 (${i + 1}/${needed}): ${business.name} — "${title}"`)
      }

      results.push({ businessId: business.id, action: 'posted', count: needed, titles: publishedTitlesThisRun })

    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      console.error(`[Cron] 자동 발행 실패 (${business.id}):`, message)
      results.push({ businessId: business.id, action: 'error', error: message })
    }
  }

  return NextResponse.json({ date: now.toISOString(), processed: businesses.length, results })
}
