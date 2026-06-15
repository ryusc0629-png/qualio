import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { PostList } from './post-list'
import { MarketingStats } from './marketing-stats'
import { getAutoPostLimit, getAutoDailyPostLimit } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

export default async function MarketingPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')

  // 업체 slug + 포스트 목록 + 구독 플랜 병렬 조회
  const [businessResult, postsResult, subResult] = await Promise.all([
    db
      .from('businesses')
      .select('slug, name, monthly_post_target')
      .eq('id', profile.business_id)
      .maybeSingle(),
    db
      .from('biz_posts')
      .select('id, slug, title, summary, published, ai_generated, published_at, image_url, naver_title, naver_content, naver_tags')
      .eq('business_id', profile.business_id)
      .order('published_at', { ascending: false }),
    db
      .from('subscriptions')
      .select('plan')
      .eq('business_id', profile.business_id)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  const business = businessResult.data
  const posts = postsResult.data ?? []
  const planId = ((subResult.data?.plan as PlanId) ?? 'beta')
  const autoPostLimit = getAutoPostLimit(planId)
  const autoDailyPostLimit = getAutoDailyPostLimit(planId)

  // 오늘 KST 기준 발행 건수 → 일 한도 초과 여부 확인
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayKSTStr = nowKST.toISOString().slice(0, 10)
  const todayPostCount = posts.filter((p) => {
    if (!p.published) return false
    const pKST = new Date(new Date(p.published_at).getTime() + 9 * 60 * 60 * 1000)
    return pKST.toISOString().slice(0, 10) === todayKSTStr
  }).length
  const isTodayComplete = todayPostCount >= autoDailyPostLimit

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">마케팅 포스팅</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI가 GEO 최적화 포스트를 자동 작성합니다. 포스트가 쌓일수록 AI 검색엔진에 더 자주 노출됩니다.
        </p>
      </div>

      <PostList
        posts={posts}
        businessSlug={business?.slug ?? null}
        businessId={profile.business_id}
        monthlyTarget={business?.monthly_post_target ?? 0}
        autoPostLimit={autoPostLimit}
        planId={planId}
        isTodayComplete={isTodayComplete}
      />

      <div className="border-t pt-6">
        <Suspense fallback={
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground animate-pulse">
            성과 데이터를 불러오는 중...
          </div>
        }>
          <MarketingStats businessId={profile.business_id} />
        </Suspense>
      </div>
    </div>
  )
}
