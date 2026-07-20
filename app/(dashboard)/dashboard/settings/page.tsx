import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from './settings-form'
import { CurrentPlanCard } from '@/components/dashboard/current-plan-card'
import { CancelSubscriptionButton } from '@/components/dashboard/cancel-subscription-button'
import { GeoPanel } from '@/components/dashboard/geo-panel'
import { CopyLinkButton } from '@/components/dashboard/copy-link-button'
import { PushNotificationToggle } from '@/components/dashboard/push-notification-toggle'
import type { PlanId } from '@/lib/config/plans'
import Link from 'next/link'
import { Layers, ChevronRight } from 'lucide-react'

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

  const [businessResult, subscriptionResult, serviceCountResult] = await Promise.all([
    db
      .from('businesses')
      .select('id, name, phone, address, description, naver_place_url, google_place_url, danggeun_review_url, kakao_place_url, active_review_platform, youtube_url, instagram_url, naver_blog_id, danggeun_business_url, service_areas, review_reward_type, review_reward_description, slug, seo_title, seo_description, seo_keywords, seo_faqs, seo_generated_at, logo_url, hero_image_url, brand_color, brand_color_secondary, hero_style, hero_title, hero_subtitle, testimonials' as never)
      .eq('id', profile.business_id)
      .maybeSingle(),
    db
      .from('subscriptions')
      .select('plan, status, current_period_end, next_plan' as never)
      .eq('business_id', profile.business_id)
      .maybeSingle() as unknown as Promise<{ data: { plan: string; status: string; current_period_end: string | null; next_plan: string | null } | null; error: unknown }>,
    // GEO 생성 게이트용 — 등록된 활성 서비스 개수 (0개면 추측성 생성 방지)
    db
      .from('service_items')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', profile.business_id)
      .eq('is_active', true)
      .is('deleted_at', null),
  ])

  const serviceCount = serviceCountResult.count ?? 0

  if (!businessResult.data) redirect('/onboarding')

  const business = businessResult.data as unknown as {
    id: string; name: string; phone: string | null; address: string | null; description: string | null
    naver_place_url: string | null; google_place_url: string | null; danggeun_review_url: string | null
    kakao_place_url: string | null; active_review_platform: string; youtube_url: string | null
    instagram_url: string | null; naver_blog_id: string | null; danggeun_business_url: string | null; service_areas: string[] | null
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

  // 지역 GEO 최적화엔 주소가 필수 — 비어 있으면 생성 게이트로 막는다
  const hasAddress = !!business.address?.trim()

  const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  // 읽기 좋은 주소(slug)가 있으면 그걸로, 없으면 옛 UUID로 — 둘 다 /q 라우트가 받음
  const quoteUrl = `${baseUrl}/q/${business.slug ?? profile.business_id}`

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">설정</h1>
        <p className="text-sm text-muted-foreground mt-1">업체 정보 및 채널 연동을 관리합니다</p>
      </div>

      {/* 폰 알림 받기 (앱 푸시) */}
      <PushNotificationToggle />

      {/* 견적 플랜 가격·할인 설정 바로가기 */}
      <Link
        href="/dashboard/tiers"
        className="flex items-center gap-3 bg-white rounded-xl border border-border p-5 hover:border-primary/40 transition-colors"
      >
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm">견적 플랜 이름·구성</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            플랜 이름(기본·추천·프리미엄)과 강조 표시, 묶음 구성을 정해요. 가격·할인은 각 서비스 편집에서 설정해요
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
      </Link>

      {/* 고객 견적 요청 링크 */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-sm">고객 견적 요청 링크</h2>
          <p className="text-xs text-muted-foreground mt-1">
            카카오톡·문자로 공유하면 고객이 직접 견적을 요청할 수 있어요.
            홈 화면 우측 상단 <span className="font-medium text-foreground">견적 링크 복사</span> 버튼으로도 빠르게 복사할 수 있어요.
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

      {/* GEO 자동화 패널 — 미리보기 체크리스트에서 여기로 이동시키기 위해 id 부여 */}
      <div id="field-geo">
      <GeoPanel
        businessId={business.id}
        businessName={business.name ?? null}
        serviceCount={serviceCount}
        hasAddress={hasAddress}
        slug={business.slug ?? null}
        seoTitle={business.seo_title ?? null}
        seoDescription={business.seo_description ?? null}
        seoKeywords={business.seo_keywords ?? null}
        seoFaqs={(business.seo_faqs as unknown as FaqItem[]) ?? []}
        seoGeneratedAt={business.seo_generated_at ?? null}
      />
      </div>

      {/* 업체 정보 */}
      <SettingsForm
        business={business}
        serviceCount={serviceCount}
        hasGeneratedPage={!!business.seo_generated_at}
      />
    </div>
  )
}
