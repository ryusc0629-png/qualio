import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PostList } from './post-list'

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

  // 업체 slug + 포스트 목록 병렬 조회
  const [businessResult, postsResult] = await Promise.all([
    db
      .from('businesses')
      .select('slug, name, monthly_post_target')
      .eq('id', profile.business_id)
      .maybeSingle(),
    db
      .from('biz_posts')
      .select('id, slug, title, summary, published, ai_generated, published_at')
      .eq('business_id', profile.business_id)
      .order('published_at', { ascending: false }),
  ])

  const business = businessResult.data
  const posts = postsResult.data ?? []

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
      />
    </div>
  )
}
