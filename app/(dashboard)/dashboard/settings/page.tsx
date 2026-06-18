import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from './settings-form'
import { CurrentPlanCard } from '@/components/dashboard/current-plan-card'
import { CancelSubscriptionButton } from '@/components/dashboard/cancel-subscription-button'
import { GeoPanel } from '@/components/dashboard/geo-panel'
import { CopyLinkButton } from '@/components/dashboard/copy-link-button'
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
      .select('id, name, phone, address, description, naver_place_url, google_place_url, danggeun_review_url, kakao_place_url, active_review_platform, youtube_url, review_reward_type, review_reward_description, slug, seo_title, seo_description, seo_keywords, seo_faqs, seo_generated_at, logo_url, hero_image_url, brand_color, brand_color_secondary, hero_style, hero_title, hero_subtitle, testimonials' as never)
      .eq('id', profile.business_id)
      .maybeSingle(),
    db
      .from('subscriptions')
      .select('plan, status, current_period_end, next_plan' as never)
      .eq('business_id', profile.business_id)
      .maybeSingle() as unknown as Promise<{ data: { plan: string; status: string; current_period_end: string | null; next_plan: string | null } | null; error: unknown }>,
  ])

  if (!businessResult.data) redirect('/onboarding')

  const business = businessResult.data as unknown as {
    id: string; name: string; phone: string | null; address: string | null; description: string | null
    naver_place_url: string | null; google_place_url: string | null; danggeun_review_url: string | null
    kakao_place_url: string | null; active_review_platform: string; youtube_url: string | null
    review_reward_type: string; review_reward_description: string | null
    slug: string | null; seo_title: string | null; seo_description: string | null
    seo_keywords: string | null; seo_faqs: unknown; seo_generated_at: string | null
    logo_url: string | null; hero_image_url: string | null; brand_color: string | null
    brand_color_secondary: string | null; hero_style: string | null
    hero_title: string | null; hero_subtitle: string | null
    testimonials: { quote: string; author: string }[] | null
  }
  const subscription = subscriptionResult.data ?? {
    plan: 'beta',
    status: 'active',
    current_period_end: null,
    next_plan: null,
  }

  const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const quoteUrl = `${baseUrl}/q/${profile.business_id}`

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">설정</h1>
        <p className="text-sm text-muted-foreground mt-1">업체 정보 및 채널 연동을 관리합니다</p>
      </div>

      {/* 고객 견적 요청 링크 */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-sm">고객 견적 요청 링크</h2>
          <p className="text-xs text-muted-foreground mt-1">
            카카오톡·문자로 공유하면 고객이 직접 견적을 요청할 수 있어요.
            대시보드 우측 상단 <span className="font-medium text-foreground">견적 링크 복사</span> 버튼으로도 빠르게 복사할 수 있어요.
          </p>
        </div>
        <CopyLinkButton url={quoteUrl} />
      </div>

      {/* 구독 플랜 현황 */}
      <CurrentPlanCard
        planId={(subscription.plan as PlanId) ?? 'beta'}
        status={subscription.status ?? 'active'}
        currentPeriodEnd={subscription.current_period_end ?? null}
        nextPlan={subscription.next_plan ?? null}
      />

      {/* 구독 취소 — 유료 플랜 + 활성 상태일 때만 노출 */}
      {subscription.plan !== 'beta' && subscription.status === 'active' && (
        <div className="flex justify-end">
          <CancelSubscriptionButton />
        </div>
      )}

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
