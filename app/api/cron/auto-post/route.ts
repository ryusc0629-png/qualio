import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePostContent, generateTopicSuggestions } from '@/lib/ai/geo-content'
import { getAutoPostLimit } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

// Vercel Cron: 매일 00:00 UTC (한국 오전 9시) + 12:00 UTC (한국 오후 9시) 실행
// → 하루 2회 실행으로 월 60건(스케일) 지원
// vercel.json에 등록된 cron만 호출 가능 — CRON_SECRET으로 인증

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// 오늘 발행해야 하는지 판단 — 목표 건수를 한 달에 균등 분포
function shouldPostToday(
  postsThisMonth: number,
  target: number,
  dayOfMonth: number,
  daysInMonth: number,
): boolean {
  if (postsThisMonth >= target) return false
  // 이번 달 진행률이 발행 진행률보다 앞서 있으면 오늘 발행
  const monthProgress = dayOfMonth / daysInMonth
  const postProgress = postsThisMonth / target
  return monthProgress >= postProgress
}

export async function GET(request: NextRequest) {
  // Vercel Cron 인증 확인
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1   // 1~12
  const dayOfMonth = now.getUTCDate()
  const daysInMonth = getDaysInMonth(year, month)

  // 자동 발행이 켜진 업체 전체 조회
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

  const results: { businessId: string; action: string; title?: string; error?: string }[] = []

  for (const business of businesses) {
    try {
      // 구독 플랜 조회 → 실제 한도 계산 (설정값이 플랜 한도 초과 방지)
      const { data: sub } = await db
        .from('subscriptions')
        .select('plan')
        .eq('business_id', business.id)
        .eq('status', 'active')
        .maybeSingle()

      const planId = ((sub?.plan as PlanId) ?? 'beta')
      const planLimit = getAutoPostLimit(planId)
      const effectiveTarget = Math.min(business.monthly_post_target, planLimit)

      // 이번 달 발행 건수 확인
      const monthStart = new Date(year, month - 1, 1).toISOString()
      const { count } = await db
        .from('biz_posts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .eq('published', true)
        .gte('published_at', monthStart)

      const postsThisMonth = count ?? 0

      if (!shouldPostToday(postsThisMonth, effectiveTarget, dayOfMonth, daysInMonth)) {
        results.push({ businessId: business.id, action: 'skipped' })
        continue
      }

      // 이번 달 이미 발행된 제목 조회 (중복 주제 방지)
      const { data: publishedThisMonth } = await db
        .from('biz_posts')
        .select('title')
        .eq('business_id', business.id)
        .gte('published_at', monthStart)

      const publishedTitles = (publishedThisMonth ?? []).map((p) => p.title)

      // 업체 서비스 조회
      const { data: services } = await db
        .from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .is('deleted_at', null)

      // AI로 주제 추천 — 이미 발행된 주제와 다른 것 선택
      let selectedTopic: string | undefined
      try {
        const suggestions = await generateTopicSuggestions({
          businessName: business.name,
          services: services ?? [],
          currentMonth: month,
        })
        // 발행된 제목과 겹치지 않는 첫 번째 주제 선택
        const unused = suggestions.find(
          (s) => !publishedTitles.some((t) => t.includes(s.title.slice(0, 10)))
        )
        selectedTopic = unused?.topic ?? suggestions[0]?.topic
      } catch {
        // 주제 추천 실패해도 AI가 자유 선택으로 진행
      }

      // 포스트 생성
      const postContent = await generatePostContent({
        businessName: business.name,
        address: business.address,
        description: business.description,
        services: services ?? [],
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

      if (existing) {
        slug = `${baseSlug}-${Date.now().toString(36)}`
      }

      // keyPoints/faqs 메타 블록 앞에 붙이기
      const metaBlock = (postContent.keyPoints?.length || postContent.faqs?.length)
        ? `\`\`\`json\n${JSON.stringify({ keyPoints: postContent.keyPoints ?? [], faqs: postContent.faqs ?? [] })}\n\`\`\`\n`
        : ''
      const fullContent = metaBlock + postContent.content

      const { error: insertError } = await db
        .from('biz_posts')
        .insert({
          business_id: business.id,
          slug,
          title: postContent.title,
          content: fullContent,
          summary: postContent.summary,
          ai_generated: true,
          published: true,
        })

      if (insertError) throw new Error(insertError.message)

      results.push({ businessId: business.id, action: 'posted', title: postContent.title })
      console.log(`[Cron] 자동 발행 완료: ${business.name} — "${postContent.title}"`)

    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      console.error(`[Cron] 자동 발행 실패 (${business.id}):`, message)
      results.push({ businessId: business.id, action: 'error', error: message })
    }
  }

  return NextResponse.json({
    date: now.toISOString(),
    processed: businesses.length,
    results,
  })
}
