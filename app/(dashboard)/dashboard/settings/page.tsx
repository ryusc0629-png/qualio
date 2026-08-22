import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from './settings-form'
import { CurrentPlanCard } from '@/components/dashboard/current-plan-card'
import { CancelSubscriptionButton } from '@/components/dashboard/cancel-subscription-button'
import { GeoPanel } from '@/components/dashboard/geo-panel'
import { CopyLinkButton } from '@/components/dashboard/copy-link-button'
import { PushNotificationToggle } from '@/components/dashboard/push-notification-toggle'
import { CollapsibleSection } from './collapsible-section'
import { PasswordSection } from './password-section'
import { CustomDomainSection } from '@/components/dashboard/custom-domain-section'
import { HelpRequestCard } from '@/components/dashboard/help-request-card'
import type { SupabaseClient } from '@supabase/supabase-js'
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
  // full_name = 가입할 때 받은 대표님 성함 (설정에서 고칠 수 있게 함께 읽어온다)
  const { data: profile } = await db
    .from('profiles')
    .select('business_id, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')

  const [businessResult, subscriptionResult, serviceCountResult, publicReportResult] = await Promise.all([
    db
      .from('businesses')
      .select('id, name, phone, address, description, naver_place_url, google_place_url, danggeun_review_url, kakao_place_url, active_review_platform, youtube_url, instagram_url, naver_blog_id, danggeun_business_url, service_areas, review_reward_type, review_reward_description, slug, previous_slugs, beta_number, lifetime_discount_rate, seo_title, seo_description, seo_keywords, seo_faqs, seo_generated_at, seo_stale_at, logo_url, favicon_url, hero_image_url, brand_color, brand_color_secondary, hero_style, hero_title, hero_subtitle, strengths, owner_photo_url, owner_name, owner_greeting, owner_video_url, experience_years, business_number, legal_name, payment_account, certifications, portfolio, target_customer, custom_domain, custom_domain_status, naver_site_verification, google_site_verification' as never)
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
    // 홈페이지 완성도용 — 홈 공개된 시공 사례(보고) 개수
    db
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', profile.business_id)
      .eq('is_public' as never, true as never),
  ])

  const serviceCount = serviceCountResult.count ?? 0
  const publicReportCount = publicReportResult.count ?? 0

  // 대행 요청(도메인 연결·검색 등록) 진행 상태 — 버튼 자리에 "접수됐어요"를 대신 보여준다
  const looseDb = db as unknown as SupabaseClient
  const { data: helpRequests } = (await looseDb
    .from('business_requests')
    .select('kind, status')
    .eq('business_id', profile.business_id)
    .neq('status', 'done')) as unknown as { data: { kind: string; status: string }[] | null }

  const requestStatus = (kind: string) => helpRequests?.find((r) => r.kind === kind)?.status ?? null

  if (!businessResult.data) redirect('/onboarding')

  const business = businessResult.data as unknown as {
    id: string; name: string; phone: string | null; address: string | null; description: string | null
    naver_place_url: string | null; google_place_url: string | null; danggeun_review_url: string | null
    kakao_place_url: string | null; active_review_platform: string; youtube_url: string | null
    instagram_url: string | null; naver_blog_id: string | null; danggeun_business_url: string | null; service_areas: string[] | null
    review_reward_type: string; review_reward_description: string | null
    slug: string | null; previous_slugs: string[] | null
    beta_number: number | null; lifetime_discount_rate: number | null
    seo_title: string | null; seo_description: string | null
    seo_keywords: string | null; seo_faqs: unknown; seo_generated_at: string | null
    seo_stale_at: string | null
    naver_site_verification: string | null; google_site_verification: string | null
    logo_url: string | null; favicon_url: string | null
    hero_image_url: string | null; brand_color: string | null
    brand_color_secondary: string | null; hero_style: string | null
    hero_title: string | null; hero_subtitle: string | null
    strengths: { key: string; title: string; desc: string }[] | null
    owner_photo_url: string | null; owner_name: string | null
    owner_greeting: string | null; owner_video_url: string | null
    experience_years: number | null; business_number: string | null
    legal_name: string | null
    payment_account: string | null
    certifications: string[] | null
    portfolio: { before: string; after: string }[] | null
    target_customer: string | null
    custom_domain: string | null; custom_domain_status: string | null
  }
  const subscription = subscriptionResult.data ?? {
    plan: 'beta',
    status: 'active',
    current_period_end: null,
    next_plan: null,
  }

  // 지역 GEO 최적화엔 주소가 필수 — 비어 있으면 생성 게이트로 막는다
  const hasAddress = !!business.address?.trim()

  // 가입 시 자동으로 붙는 임시 주소(무작위 5글자)인지 — 한글 상호는 영문으로 옮길 게 없어 이렇게 된다.
  // 사장님이 한 번이라도 직접 정했으면 previous_slugs에 옛 주소가 남으므로 임시가 아니다.
  const slugChosen = (business.previous_slugs?.length ?? 0) > 0
  const slugIsTemporary =
    !slugChosen && !!business.slug &&
    (/^[a-z0-9]{5}$/.test(business.slug) || /-[a-z0-9]{5}$/.test(business.slug))

  const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // 사장님 홈페이지 주소 — 자체 도메인을 연결했으면 그게 대표 주소다.
  // 아직 홈페이지를 안 만들었으면(slug 없음) null → 링크 카드에서 만들라고 안내한다.
  const homeUrl = business.custom_domain && business.custom_domain_status === 'active'
    ? `https://${business.custom_domain}`
    : business.slug
      ? `${baseUrl}/biz/${business.slug}`
      : null

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">설정</h1>
        <p className="text-sm text-muted-foreground mt-1">업체 정보 및 채널 연동을 관리합니다</p>
      </div>

      {/* 폰 알림 받기 (앱 푸시) */}
      <PushNotificationToggle />


      {/* 내 홈페이지 링크 — 사장님이 밖에 뿌리는 대표 주소는 견적 폼이 아니라 홈페이지다.
          (견적 링크는 홈 화면 우측 상단 '견적 링크 복사'에 그대로 있음) */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-sm">내 홈페이지 링크</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {homeUrl
              ? '명함·카카오톡·블로그·SNS에 이 주소를 쓰시면 됩니다. 손님이 서비스와 가격을 보고 바로 견적을 넣을 수 있어요.'
              : '아직 홈페이지를 안 만드셨어요. 아래 ‘내 홈페이지’에서 만들면 여기에 주소가 나와요.'}
          </p>
        </div>
        {homeUrl && <CopyLinkButton url={homeUrl} />}
      </div>

      {/* 구독 플랜 현황 */}
      <CurrentPlanCard
        planId={(subscription.plan as PlanId) ?? 'beta'}
        status={subscription.status ?? 'active'}
        currentPeriodEnd={subscription.current_period_end ?? null}
        nextPlan={subscription.next_plan ?? null}
        lifetimeDiscountRate={business.lifetime_discount_rate ?? 0}
        betaNumber={business.beta_number ?? null}
      />

      {/* 구독 취소 — 유료 플랜 + 활성 상태일 때만 노출 */}
      {subscription.plan !== 'beta' && subscription.status === 'active' && (
        <div className="flex justify-end">
          <CancelSubscriptionButton />
        </div>
      )}

      {/* 홈페이지 내용(GEO) — 미리보기 체크리스트에서 여기로 이동시키기 위해 id 부여 */}
      {/* 제목에 '홈페이지 주소'를 넣은 이유: 주소 바꾸는 곳이 여기라는 걸 접힌 상태에서도 알 수 있게. */}
      {/* 임시 주소(자동 생성)인 사장님에겐 처음부터 펼쳐 보여준다. */}
      <CollapsibleSection
        title="내 홈페이지 (주소 · 소개글)"
        description="손님에게 보여줄 내 홈페이지 주소를 정하고, 검색·AI(ChatGPT·Gemini)에 노출되는 업체 소개·FAQ를 자동으로 만들어요."
        defaultOpen={slugIsTemporary}
      >
      <div id="field-geo">
      <GeoPanel
        businessId={business.id}
        businessName={business.name ?? null}
        serviceCount={serviceCount}
        hasAddress={hasAddress}
        slug={business.slug ?? null}
        slugChosen={slugChosen}
        seoTitle={business.seo_title ?? null}
        seoDescription={business.seo_description ?? null}
        seoKeywords={business.seo_keywords ?? null}
        seoFaqs={(business.seo_faqs as unknown as FaqItem[]) ?? []}
        seoGeneratedAt={business.seo_generated_at ?? null}
        seoStaleAt={business.seo_stale_at ?? null}
      />
      </div>
      </CollapsibleSection>

      {/* 계정 — 비밀번호 변경. 잊었을 때는 본사가 임시 비밀번호를 만들어 준다(원문은 아무도 못 본다) */}
      <CollapsibleSection
        title="로그인 비밀번호"
        description="로그인할 때 쓰는 비밀번호를 바꿔요."
      >
        <PasswordSection />
      </CollapsibleSection>

      {/* 내 주소(도메인) 연결 — 홈페이지를 사장님 소유 주소로 띄운다 */}
      <CollapsibleSection
        title="내 인터넷 주소 연결"
        description="가지고 계신 주소가 있으면 홈페이지를 그 주소로 열 수 있어요."
      >
        <div className="space-y-4" id="field-custom-domain">
          <CustomDomainSection
            domain={(business as { custom_domain?: string | null }).custom_domain ?? null}
            status={(business as { custom_domain_status?: string | null }).custom_domain_status ?? null}
            naverVerification={business.naver_site_verification ?? null}
            googleVerification={business.google_site_verification ?? null}
          />

          {/* 주소가 없거나 혼자 하기 어려운 사장님용 — 구입부터 연결까지 본사가 대행 */}
          <HelpRequestCard
            kind="domain_setup"
            title="주소 만드는 게 어려우면 대신 해드려요"
            reasons={[
              '내 주소로 열면 검색에서 우리 업체 이름으로 쌓여요. 퀄리오 주소를 쓰면 그 점수가 퀄리오에 쌓여요',
              '명함·현수막에 적기 좋고, 손님이 한 번 보면 기억해요',
              '나중에 다른 곳으로 옮겨도 주소는 그대로 내 것이에요',
              '주소값은 보통 1년에 1~2만 원이고, 신청하시면 어떤 주소가 좋은지부터 같이 정해드려요',
            ]}
            noteLabel="원하는 주소가 있으면 적어주세요 (필수 아님)"
            notePlaceholder="예: 다트클린 또는 dartclean.co.kr"
            buttonLabel="내 인터넷 주소 만들어주세요"
            pendingLabel="담당자가 어떤 주소가 좋을지 정리해서 하루 이틀 안에 연락드려요."
            requestStatus={requestStatus('domain_setup')}
          />

          {/* 네이버·구글 검색 등록 대행 — 계정 만들기·소유확인이 사장님 혼자는 어렵다 */}
          <HelpRequestCard
            kind="search_indexing"
            title="네이버·구글 검색에 빨리 잡히게 해드려요"
            reasons={[
              '검색엔진에 "우리 홈페이지 여기 있어요" 하고 알려주는 작업이에요. 안 하면 발견될 때까지 몇 달이 걸리기도 해요',
              '해두면 새 글을 쓸 때마다 자동으로 같이 알려져요',
              '네이버·구글 양쪽 다 저희가 대신 등록하고, 끝나면 알려드려요',
            ]}
            buttonLabel="검색에 빨리 잡히게 해주세요"
            pendingLabel="저희가 네이버·구글에 등록하고 있어요. 검색에 실제로 뜨기까지는 보통 2주쯤 걸려요."
            requestStatus={requestStatus('search_indexing')}
          />
        </div>
      </CollapsibleSection>

      {/* 업체 정보 */}
      <SettingsForm
        business={business}
        ownerFullName={profile.full_name ?? ''}
        serviceCount={serviceCount}
        hasGeneratedPage={!!business.seo_generated_at}
        publicReportCount={publicReportCount}
        hasCustomDomain={
          (business as { custom_domain_status?: string | null }).custom_domain_status === 'active'
        }
      />
    </div>
  )
}
