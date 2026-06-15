import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from './settings-form'
import { CurrentPlanCard } from '@/components/dashboard/current-plan-card'
import { CancelSubscriptionButton } from '@/components/dashboard/cancel-subscription-button'
import { GeoPanel } from '@/components/dashboard/geo-panel'
import { NaverBlogPanel } from '@/components/dashboard/naver-blog-panel'
import type { PlanId } from '@/lib/config/plans'

interface FaqItem {
  question: string
  answer: string
}

export default async function SettingsPage() {
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

  const [businessResult, subscriptionResult] = await Promise.all([
    db
      .from('businesses')
      .select('id, name, phone, address, description, naver_place_url, youtube_url, slug, seo_title, seo_description, seo_keywords, seo_faqs, seo_generated_at, naver_blog_id')
      .eq('id', profile.business_id)
      .maybeSingle(),
    db
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('business_id', profile.business_id)
      .maybeSingle(),
  ])

  if (!businessResult.data) redirect('/onboarding')

  const business = businessResult.data
  const subscription = subscriptionResult.data ?? {
    plan: 'beta',
    status: 'active',
    current_period_end: null,
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">설정</h1>
        <p className="text-sm text-muted-foreground mt-1">업체 정보 및 채널 연동을 관리합니다</p>
      </div>

      {/* 구독 플랜 현황 */}
      <CurrentPlanCard
        planId={(subscription.plan as PlanId) ?? 'beta'}
        status={subscription.status ?? 'active'}
        currentPeriodEnd={subscription.current_period_end ?? null}
      />

      {/* 구독 취소 — 유료 플랜 + 활성 상태일 때만 노출 */}
      {subscription.plan !== 'beta' && subscription.status === 'active' && (
        <div className="flex justify-end">
          <CancelSubscriptionButton />
        </div>
      )}

      {/* 네이버 블로그 연동 */}
      <NaverBlogPanel naverBlogId={business.naver_blog_id ?? null} />

      {/* GEO 자동화 패널 */}
      <GeoPanel
        businessId={business.id}
        slug={business.slug ?? null}
        seoTitle={business.seo_title ?? null}
        seoDescription={business.seo_description ?? null}
        seoKeywords={business.seo_keywords ?? null}
        seoFaqs={(business.seo_faqs as unknown as FaqItem[]) ?? []}
        seoGeneratedAt={business.seo_generated_at ?? null}
      />

      {/* 업체 정보 */}
      <SettingsForm business={business} />
    </div>
  )
}
