import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePostContent, generateTopicSuggestions } from '@/lib/ai/geo-content'
import { fetchRecentJobCases, fetchRecentCasePhotos, POST_PHOTO_COUNT } from '@/lib/ai/job-cases'
import { generateAndSaveChannelContent } from '@/lib/ai/channel-content'
import { notifyIndexNowForPosts } from '@/lib/seo/indexnow'
import { pickWeakGeoTopic } from '@/lib/geo/weak-topics'
import { getOrCreatePostPlan, pickTodayPlanSlot, hasPlannedTopic } from '@/lib/geo/post-plan'
import { getAutoPostLimit, getAutoDailyPostLimit, getPostModel, isChannelContentEnabled } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { checkAutoPostReadiness } from '@/lib/marketing/auto-post-readiness'
import { acquireAutoPostLock, releaseAutoPostLock } from '@/lib/marketing/auto-post-lock'
import { fetchNeighborTitles, isTitleTaken } from '@/lib/geo/neighbor-titles'
import type { SupabaseClient } from '@supabase/supabase-js'

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
  business: { id: string; name: string; address: string | null; description: string | null; serviceAreas: string[] | null; slug: string | null },
  services: { name: string; base_price: number; unit: string }[],
  publishedTitles: string[],
  month: number,
  // 플랜별 능력 — 본문 생성 모델, SNS 채널 원고 생성 여부
  model: string,
  channelsEnabled: boolean,
  realCases: string[],
  // 고정 계획표의 오늘 슬롯 — 있으면 무조건 이 주제·제목으로 발행(달력과 일치)
  planned: { topic: string; keyword: string | null; title: string } | null,
  // 같은 지역 다른 고객사가 이미 쓴 제목 — 글자 그대로 겹치지 않게 피한다
  neighborTitles: string[],
): Promise<string> {
  // 주제 선택 — 무조건 고정 계획표의 오늘 슬롯을 그대로 따른다.
  let selectedTopic: string | undefined = planned?.topic || undefined
  let selectedKeyword: string | undefined = planned?.keyword ?? undefined

  // 폴백1: 계획 슬롯이 없을 때만 GEO '안 잡히는 질문' 조회
  if (!selectedTopic) {
    try {
      const weak = await pickWeakGeoTopic(db, business.id, publishedTitles)
      if (weak) {
        selectedTopic = weak.topic
        selectedKeyword = weak.keyword
      }
    } catch {
      // GEO 약점 조회 실패 시 아래 일반 주제 추천으로 진행
    }
  }

  // 폴백2: 약점 질문도 없으면(모두 노출 중이거나 측정 전) 기존 월간 주제 추천
  if (!selectedTopic) {
    try {
      const suggestions = await generateTopicSuggestions({
        businessName: business.name,
        services,
        currentMonth: month,
        // 이번 달 이미 발행한 제목(같은 실행 내 직전 발행분 포함) → AI가 유사 주제까지 제외
        recentTitles: publishedTitles,
        skipKeywordData: true, // 발행 경로: 검색량 배지 불필요 → 네이버 API 생략(지연·의존성 제거)
      })
      const unused = suggestions.find(
        (s) => !publishedTitles.some((t) => t.includes(s.title.slice(0, 10)))
      )
      selectedTopic = unused?.topic ?? suggestions[0]?.topic
    } catch {
      // 주제 추천 실패 시 AI 자유 선택
    }
  }

  // 계획표 제목이 이웃 업체 제목과 글자 그대로 같으면 고집하지 않는다.
  // 달력과 제목이 어긋나는 건 우리 안의 사소한 불일치지만, 같은 지역에 같은 제목이
  // 두 개 뜨는 건 두 고객사의 검색 순위를 함께 깎는 실제 손해다.
  const plannedTitle = planned?.title && !isTitleTaken(planned.title, neighborTitles)
    ? planned.title
    : undefined

  const postContent = await generatePostContent({
    businessName: business.name,
    address: business.address,
    description: business.description,
    services,
    topic: selectedTopic,
    keyword: selectedKeyword, // GEO 약점 질문의 핵심 검색어 — 제목·본문 최적화
    serviceAreas: business.serviceAreas,
    model,
    realCases,
    titleOverride: plannedTitle, // 계획표에 확정된 제목 그대로 발행(달력과 일치)
    // 이웃 업체 제목 + 이번 달 자기가 쓴 제목 — 둘 다 피한다
    avoidTitles: [...neighborTitles, ...publishedTitles],
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

  // 이미지 — 공개 승인된 작업보고의 진짜 비포/애프터 사진만 싣는다(실사례=설득력·해자).
  //          실사진이 없으면 사진 없이 글만 발행한다.
  const casePhotos = await fetchRecentCasePhotos(db, business.id)
  const imageUrls = [...casePhotos.before, ...casePhotos.after].slice(0, POST_PHOTO_COUNT)
  // 대표 이미지(커버)는 '결과'가 드러나는 애프터 사진을 우선 — 눈길을 끄는 게 애프터라서.
  const coverUrl = casePhotos.after[0] ?? imageUrls[0] ?? null

  const fullContent = metaBlock + postContent.content
  const { data: saved, error } = await db.from('biz_posts').insert({
    business_id: business.id,
    slug,
    title: postContent.title,
    content: fullContent,
    summary: postContent.summary,
    image_url: coverUrl,
    image_urls: imageUrls,
    ai_generated: true,
    published: true,
  }).select('id').single()

  if (error) throw new Error(error.message)

  // 네이버·당근·인스타 채널 텍스트 자동 생성 (플랜에 포함된 경우만, 실패해도 GEO 발행은 유지)
  if (channelsEnabled && saved?.id) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
    await generateAndSaveChannelContent(db, saved.id, {
      businessName: business.name,
      address: business.address,
      geoTitle: postContent.title,
      geoContent: fullContent,
      // 견적 링크는 슬러그(깔끔) 우선, 없으면 UUID 폴백 — 둘 다 /q 라우트가 처리
      quoteBaseUrl: `${appUrl}/q/${business.slug ?? business.id}`,
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

  // KST 기준 오늘 — 고정 계획표는 KST '일'로 슬롯을 잡는다
  const todayKSTStr = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const monthKST = todayKSTStr.slice(0, 7)
  const todayDayKST = Number(todayKSTStr.slice(8, 10))
  const daysInMonthKST = getDaysInMonth(Number(todayKSTStr.slice(0, 4)), Number(todayKSTStr.slice(5, 7)))

  const { data: businesses, error: bizError } = await db
    .from('businesses' as never)
    .select('id, name, address, description, service_areas, monthly_post_target, slug' as never)
    .gt('monthly_post_target' as never, 0) as unknown as {
      data: { id: string; name: string; address: string | null; description: string | null; service_areas: string[] | null; monthly_post_target: number; slug: string | null }[] | null
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

      // 재료(서비스 항목·지역)가 없으면 발행하지 않는다.
      //
      // 없어도 글은 '써지긴' 한다 — 하지만 프롬프트에 '청소 서비스' + '위치 정보 없음'만 들어가서
      // 무슨 청소를 하는 어느 동네 업체인지 알 수 없는 뻔한 글이 된다.
      // 그런 글은 지역 검색에 안 잡히고(그게 이 기능의 전부다) AI가 인용할 이유도 없다.
      // 토큰만 나가고, 품질 낮은 글이 쌓이면 나중에 제대로 쓴 글의 평가까지 깎인다.
      //
      // ⚠️설정(monthly_post_target)은 건드리지 않는다 — 재료를 채우면 다음 날 알아서 다시 나간다.
      const readiness = await checkAutoPostReadiness(db as unknown as SupabaseClient, business.id)
      if (!readiness.ready) {
        const missing = readiness.items.filter((i) => !i.done).map((i) => i.label).join(', ')
        console.log(`[Cron] auto-post 재료 부족으로 건너뜀 business=${business.id} (${missing})`)
        results.push({ businessId: business.id, action: 'skipped-not-ready' })
        continue
      }

      // 이번 달 발행 제목 + 발행일(KST) — 중복 방지 및 계획표 슬롯 매칭용 (AI GEO 글만)
      const { data: publishedThisMonth } = await db
        .from('biz_posts')
        .select('title, published_at' as never)
        .eq('business_id', business.id)
        .eq('post_type' as never, 'geo')
        .gte('published_at', monthStart) as unknown as { data: { title: string; published_at: string }[] | null }
      const publishedTitles = (publishedThisMonth ?? []).map((p) => p.title)
      const publishedDays = new Set<number>(
        (publishedThisMonth ?? []).map((p) => Number(new Date(new Date(p.published_at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(8, 10)))
      )

      // ★ '하루 상한' 가드 — 이 라우트가 하루에 여러 번 호출돼도(자가복구용 재시도·중복 크론)
      //   오늘 발행 건수가 플랜의 일 한도(dailyLimit)를 넘지 못하게 막는다.
      //   needed 는 '이번 달 페이스 대비 밀린 양'이라 라우트 호출마다 계속 >0 일 수 있어,
      //   이 가드가 없으면 아침에 여러 번 트리거될 때 하루에 밀린 만큼 몰아 발행되는 사고가 난다.
      //   9시 실행을 놓쳤을 때만(오늘 0건) 보충 발행되고, 이미 채웠으면 조용히 건너뛴다.
      const publishedTodayCount = (publishedThisMonth ?? []).filter(
        (p) => Number(new Date(new Date(p.published_at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(8, 10)) === todayDayKST
      ).length
      const toPublish = Math.min(needed, Math.max(0, dailyLimit - publishedTodayCount))
      if (toPublish === 0) {
        results.push({ businessId: business.id, action: 'skipped-daily-cap' })
        continue
      }

      // 고정 계획표에서 오늘 발행할 슬롯을 가져온다(달력·수동 발행과 동일한 주제).
      const plan = await getOrCreatePostPlan(db, business.id, {
        month: monthKST,
        currentMonthNum: Number(monthKST.slice(5, 7)),
        daysInMonth: daysInMonthKST,
        today: todayDayKST,
        target: effectiveTarget,
        businessName: business.name,
        address: business.address,
        publishedDays,
      })
      const todaySlot = pickTodayPlanSlot(plan, todayDayKST, publishedDays)

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
      // 같은 지역 다른 고객사가 최근 쓴 제목 (업체당 1회 조회)
      const neighborTitles = await fetchNeighborTitles(db as unknown as SupabaseClient, business.id, { address: business.address })

      // ★자리 맡기 — 위 '하루 상한' 가드만으로는 못 막는다.
      //   글 한 편에 40초~5분이 걸려서, 그 사이에 시작한 다른 실행은 아직 0건으로 읽는다.
      //   드라이버가 둘(pg_cron 재시도 + Vercel cron)이라 실제로 같은 글이 두 번 올라갔다.
      //   수동 '지금 발행'과도 같은 락을 쓰므로 서로 겹치지 않는다.
      if (!(await acquireAutoPostLock(db as unknown as SupabaseClient, business.id))) {
        console.log(`[Cron] auto-post 다른 실행이 작성 중이라 건너뜀 business=${business.id}`)
        results.push({ businessId: business.id, action: 'skipped-locked' })
        continue
      }

      const publishedTitlesThisRun: string[] = []
      try {
        for (let i = 0; i < toPublish; i++) {
          // 주제가 안 정해진 빈 슬롯은 계획으로 쓰지 않는다 — 안내 문구가 글 제목이 되어 버린다
          const planned = hasPlannedTopic(todaySlot) ? { topic: todaySlot!.topic, keyword: todaySlot!.keyword, title: todaySlot!.label } : null
          const title = await publishOnePost(db, { ...business, serviceAreas: business.service_areas }, services ?? [], publishedTitles, month, model, channelsEnabled, realCases, planned, neighborTitles)
          publishedTitlesThisRun.push(title)
          console.log(`[Cron] 자동 발행 완료 (${i + 1}/${toPublish}): ${business.name} — "${title}"`)
        }
      } finally {
        // 실패했더라도 반드시 풀어준다 — 안 풀면 다음 실행이 6분간 막힌다
        await releaseAutoPostLock(db as unknown as SupabaseClient, business.id)
      }

      results.push({ businessId: business.id, action: 'posted', count: toPublish, titles: publishedTitlesThisRun })

    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      console.error(`[Cron] 자동 발행 실패 (${business.id}):`, message)
      results.push({ businessId: business.id, action: 'error', error: message })
    }
  }

  return NextResponse.json({ date: now.toISOString(), processed: businesses.length, results })
}
