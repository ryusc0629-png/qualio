import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePostContent, generateTopicSuggestions } from '@/lib/ai/geo-content'
import { generatePostImage } from '@/lib/ai/image-gen'
import { getAutoPostLimit } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

// Vercel Cron: 매일 00:00 UTC (한국 오전 9시) 실행
// 1회 실행 시 오늘 발행해야 할 건수만큼 반복 발행 (스케일 플랜 하루 2건 지원)
// vercel.json에 등록된 cron만 호출 가능 — CRON_SECRET으로 인증

// 오늘 발행해야 할 건수 계산 — 구독 시작일 기준 30일 롤링 균등 분포
function postsToPublishToday(
  postsThisPeriod: number,
  target: number,
  daysElapsed: number,
): number {
  if (postsThisPeriod >= target) return 0
  // 오늘까지 발행됐어야 할 누적 건수 (30일 기준)
  const expectedSoFar = Math.floor(target * Math.min(daysElapsed, 30) / 30)
  return Math.max(0, expectedSoFar - postsThisPeriod)
}

// 구독 시작일 기준 현재 청구 주기 시작일 계산 (30일 롤링)
function getBillingPeriodStart(subscriptionCreatedAt: string | null, now: Date): Date {
  if (!subscriptionCreatedAt) {
    // 구독일 없으면 이번 달 1일로 폴백
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  }
  const subStart = new Date(subscriptionCreatedAt)
  const elapsedMs = now.getTime() - subStart.getTime()
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24))
  const periodIndex = Math.floor(elapsedDays / 30)
  return new Date(subStart.getTime() + periodIndex * 30 * 24 * 60 * 60 * 1000)
}

// 포스트 1건 생성 및 저장
async function publishOnePost(
  db: ReturnType<typeof createServiceClient>,
  business: { id: string; name: string; address: string | null; description: string | null },
  services: { name: string; base_price: number; unit: string }[],
  publishedTitles: string[],
  month: number,
): Promise<string> {
  // AI로 주제 추천
  let selectedTopic: string | undefined
  try {
    const suggestions = await generateTopicSuggestions({
      businessName: business.name,
      services,
      currentMonth: month,
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

  // 포스트 주제에 맞는 이미지 자동 생성 (실패해도 포스팅 진행)
  const imageUrl = postContent.imagePrompt
    ? await generatePostImage(postContent.imagePrompt)
    : null

  const { error } = await db.from('biz_posts').insert({
    business_id: business.id,
    slug,
    title: postContent.title,
    content: metaBlock + postContent.content,
    summary: postContent.summary,
    image_url: imageUrl,
    ai_generated: true,
    published: true,
  })

  if (error) throw new Error(error.message)

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
  const month = now.getUTCMonth() + 1

  const { data: businesses, error: bizError } = await db
    .from('businesses')
    .select('id, name, address, description, monthly_post_target')
    .gt('monthly_post_target', 0)

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
        .select('plan, created_at')
        .eq('business_id', business.id)
        .eq('status', 'active')
        .maybeSingle()

      const planId = ((sub?.plan as PlanId) ?? 'beta')
      const planLimit = getAutoPostLimit(planId)
      const effectiveTarget = Math.min(business.monthly_post_target, planLimit)

      // 구독 시작일 기준 현재 청구 주기 시작일 (30일 롤링)
      const periodStart = getBillingPeriodStart(sub?.created_at ?? null, now)
      const daysElapsed = Math.floor((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

      const { count } = await db
        .from('biz_posts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .eq('published', true)
        .gte('published_at', periodStart.toISOString())

      const postsThisPeriod = count ?? 0
      const needed = postsToPublishToday(postsThisPeriod, effectiveTarget, daysElapsed)

      if (needed === 0) {
        results.push({ businessId: business.id, action: 'skipped' })
        continue
      }

      // 이번 주기 발행 제목 목록 (중복 방지용)
      const { data: publishedThisMonth } = await db
        .from('biz_posts')
        .select('title')
        .eq('business_id', business.id)
        .gte('published_at', periodStart.toISOString())
      const publishedTitles = (publishedThisMonth ?? []).map((p) => p.title)

      const { data: services } = await db
        .from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .not('base_price', 'is', null)
        .not('unit', 'is', null)

      // 오늘 필요한 건수만큼 순차 발행
      const publishedTitlesThisRun: string[] = []
      for (let i = 0; i < needed; i++) {
        const title = await publishOnePost(db, business, services ?? [], publishedTitles, month)
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
