import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePostContent, generateTopicSuggestions } from '@/lib/ai/geo-content'
import { generatePostImage } from '@/lib/ai/image-gen'
import { getAutoPostLimit, getAutoDailyPostLimit } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

// Vercel Cron: 매일 00:00 UTC (한국 오전 9시) 실행
// 1회 실행 시 오늘 발행해야 할 건수만큼 반복 발행 (스케일 플랜 하루 2건 지원)
// vercel.json에 등록된 cron만 호출 가능 — CRON_SECRET으로 인증

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

  const fullContent = metaBlock + postContent.content
  const { data: saved, error } = await db.from('biz_posts').insert({
    business_id: business.id,
    slug,
    title: postContent.title,
    content: fullContent,
    summary: postContent.summary,
    image_url: imageUrl,
    ai_generated: true,
    published: true,
  }).select('id').single()

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
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const dayOfMonth = now.getUTCDate()
  const daysInMonth = getDaysInMonth(year, month)

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
        .select('plan')
        .eq('business_id', business.id)
        .eq('status', 'active')
        .maybeSingle()

      const planId = ((sub?.plan as PlanId) ?? 'beta')
      const planLimit = getAutoPostLimit(planId)
      const dailyLimit = getAutoDailyPostLimit(planId)
      const effectiveTarget = Math.min(business.monthly_post_target, planLimit)

      // 달력 월 기준 발행 건수 집계
      const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString()
      const { count } = await db
        .from('biz_posts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .eq('published', true)
        .gte('published_at', monthStart)

      const postsThisMonth = count ?? 0
      const needed = postsToPublishToday(postsThisMonth, effectiveTarget, dayOfMonth, daysInMonth, dailyLimit)

      if (needed === 0) {
        results.push({ businessId: business.id, action: 'skipped' })
        continue
      }

      // 이번 달 발행 제목 목록 (중복 방지용)
      const { data: publishedThisMonth } = await db
        .from('biz_posts')
        .select('title')
        .eq('business_id', business.id)
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
