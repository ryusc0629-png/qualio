import { createServiceClient } from '@/lib/supabase/server'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MapPin,
  Phone,
  CheckCircle2,
  Clock,
  Shield,
  Star,
  ArrowRight,
  Sparkles,
  ClipboardList,
  CalendarCheck,
  MessageCircle,
  BadgeCheck,
  Zap,
  BookOpen,
  ThumbsUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FadeIn } from '@/components/ui/fade-in'
import { ServiceList } from './service-list'
import { HeroLeadForm, type HeroFormService } from './hero-lead-form'
import { buildBrandStyle, toBrandSettings } from '@/lib/brand'
import { trackPageView } from '@/lib/utils/track-page-view'
import { buildAreaServed } from '@/lib/address/parse-region'
import { getReviewSummary } from '@/lib/reviews/get-reviews'
import { DEFAULT_STRENGTHS, getStrengthIcon } from '@/lib/business/strengths'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ ch?: string }>
}

interface FaqItem {
  question: string
  answer: string
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = rawSlug.normalize('NFC') // 한글 주소 NFC/NFD 불일치로 인한 매칭 실패 방지
  const db = createServiceClient()

  const { data: business } = await db
    .from('businesses')
    .select('name, seo_title, seo_description, seo_keywords, address')
    .eq('slug', slug)
    .maybeSingle()

  if (!business) return { title: '업체를 찾을 수 없습니다' }

  const title = business.seo_title ?? `${business.name} | 청소 전문업체`
  const description = business.seo_description ?? `${business.name}에서 제공하는 청소 서비스입니다.`
  const keywords = business.seo_keywords ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${appUrl}/biz/${slug}`,
      siteName: '퀄리오',
    },
    twitter: { card: 'summary', title, description },
    alternates: { canonical: `${appUrl}/biz/${slug}` },
  }
}


export default async function BizLandingPage({ params, searchParams }: Props) {
  const { slug: rawSlug } = await params
  const { ch } = await searchParams
  const slug = rawSlug.normalize('NFC') // 한글 주소 NFC/NFD 불일치로 인한 매칭 실패 방지
  const db = createServiceClient()

  const { data: business } = await db
    .from('businesses')
    .select('id, name, phone, address, description, seo_title, seo_description, seo_keywords, seo_faqs, naver_place_url, google_place_url, danggeun_review_url, kakao_place_url, instagram_url, youtube_url, service_areas, logo_url, hero_image_url, brand_color, brand_color_secondary, hero_style, hero_title, hero_subtitle, strengths, owner_photo_url, owner_name, owner_greeting, owner_video_url, experience_years, business_number, certifications, portfolio, target_customer' as never)
    .eq('slug', slug)
    .maybeSingle() as { data: {
      id: string; name: string; phone: string | null; address: string | null
      description: string | null; seo_title: string | null; seo_description: string | null
      seo_keywords: string | null; seo_faqs: unknown; naver_place_url: string | null
      google_place_url: string | null; danggeun_review_url: string | null
      kakao_place_url: string | null; instagram_url: string | null
      youtube_url: string | null; service_areas: string[] | null
      logo_url: string | null; hero_image_url: string | null
      brand_color: string | null; brand_color_secondary: string | null
      hero_style: string | null; hero_title: string | null; hero_subtitle: string | null
      strengths: { key: string; title: string; desc: string }[] | null
      owner_photo_url: string | null; owner_name: string | null
      owner_greeting: string | null; owner_video_url: string | null
      experience_years: number | null; business_number: string | null
      certifications: string[] | null
      portfolio: { before: string; after: string }[] | null
      target_customer: string | null
    } | null }

  if (!business) {
    // 옛 주소로 들어왔으면 현재 주소로 영구 이동(301) — 기존/공유/색인된 링크 보존
    const { data: moved } = await db
      .from('businesses')
      .select('slug')
      .contains('previous_slugs' as never, [slug] as never)
      .maybeSingle() as unknown as { data: { slug: string | null } | null }
    if (moved?.slug) permanentRedirect(`/biz/${moved.slug}`)
    notFound()
  }

  // ── 브랜드 테마 ── (CSS 변수 주입, AI 토큰과 무관)
  const brand = toBrandSettings(business)
  const themeStyle = buildBrandStyle(brand)
  const isLightHero = brand.heroStyle === 'light'
  // 히어로 이미지가 있으면 항상 어두운 스타일 (오버레이 위에 흰 텍스트)
  const hasHeroImage = !!business.hero_image_url
  const effectiveDark = !isLightHero || hasHeroImage
  // 히어로 dark/light 변형별 클래스
  const hero = {
    section: isLightHero && !hasHeroImage
      ? 'relative overflow-hidden bg-gradient-to-br from-primary/10 via-white to-white'
      : 'relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
    title: effectiveDark ? 'text-white' : 'text-slate-900',
    desc: effectiveDark ? 'text-slate-300' : 'text-slate-600',
    muted: effectiveDark ? 'text-slate-400' : 'text-slate-500',
    mutedHover: effectiveDark ? 'hover:text-white' : 'hover:text-slate-900',
    statCard: effectiveDark
      ? 'bg-white/8 backdrop-blur border border-white/10'
      : 'bg-white border border-slate-200 shadow-sm',
    statValue: effectiveDark ? 'text-white' : 'text-slate-900',
    statSub: effectiveDark ? 'text-slate-400' : 'text-slate-500',
    outlineBtn: effectiveDark
      ? 'border-white/50 text-white hover:bg-white/10 hover:text-white'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900',
  }

  const [{ data: services }, { data: recentPosts }, portfolioResult, reviewSummary] = await Promise.all([
    db
      .from('service_items')
      .select('id, name, base_price, unit, category')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .order('created_at'),
    db
      .from('biz_posts')
      .select('slug, title, summary, published_at')
      .eq('business_id', business.id)
      .eq('published', true)
      .eq('post_type' as never, 'geo' as never) // 정보 글만 — 시공 사례(portfolio)는 아래 갤러리로 분리
      .order('published_at', { ascending: false })
      .limit(3),
    // 시공 사례 갤러리 — 사장님이 홈 공개한 작업 보고의 비포/애프터 사진
    db
      .from('reports')
      .select('id, report_photos(url, type, sort_order)')
      .eq('business_id', business.id)
      .eq('is_public' as never, true as never)
      .order('created_at', { ascending: false })
      .limit(12),
    // 실제 고객 후기 요약(사회적 증거)
    getReviewSummary(db, business.id, 6),
    // 브랜드 홈 방문 추적 (병렬)
    trackPageView(db, business.id, 'brand_home', ch),
  ])

  // 시공 사례 — ① 사장님이 직접 등록한 비포·애프터(businesses.portfolio) 우선
  //            ② 공개된 작업 보고에서 비포·애프터 첫 장이 모두 있는 것 (합쳐서 최대 6건)
  const manualPortfolio = (business.portfolio ?? [])
    .filter((p) => p.before?.trim() && p.after?.trim())
    .map((p, idx) => ({ id: `manual-${idx}`, before: p.before, after: p.after }))

  const reportPortfolio = (
    (portfolioResult as unknown as {
      data: { id: string; report_photos: { url: string; type: string; sort_order: number }[] | null }[] | null
    }).data ?? []
  )
    .map((r) => {
      const photos = r.report_photos ?? []
      const before = photos.filter((p) => p.type === 'before').sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null
      const after = photos.filter((p) => p.type === 'after').sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null
      return { id: r.id, before, after }
    })
    .filter((p): p is { id: string; before: string; after: string } => !!p.before && !!p.after)

  const portfolio = [...manualPortfolio, ...reportPortfolio].slice(0, 6)

  // 히어로 인라인 견적 폼용 서비스 — 자동견적 가능 여부 판별에 필요한 유형 컬럼 포함(/q 견적폼과 동일 형태)
  const { data: formServices } = await db
    .from('service_items')
    .select('id, name, base_price, unit, ac_type_prices, unit_prices, unit_variants' as never)
    .eq('business_id', business.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at') as unknown as { data: HeroFormService[] | null }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  const faqs = (business.seo_faqs as unknown as FaqItem[]) ?? []

  // 견적폼 링크에 유입 채널(ch) 전달 — 광고 유입이 견적 단계까지 추적되도록
  const quoteHref = ch ? `/q/${business.id}?ch=${encodeURIComponent(ch)}` : `/q/${business.id}`

  // 랜딩 안의 CTA는 별도 견적페이지(/q)로 보내지 않고 히어로 인라인 폼으로 스크롤 — 입력 경로를 하나로 통일.
  // 폼이 없는 신규 업체(서비스 미등록)만 기존 견적페이지로 폴백.
  const hasHeroForm = !!(formServices && formServices.length > 0)
  const primaryCta = hasHeroForm ? '#lead-form' : quoteHref

  // YouTube URL → embed ID 추출
  function getYoutubeId(url: string | null): string | null {
    if (!url) return null
    // 일반(watch?v=)·단축(youtu.be)·임베드·쇼츠(세로영상)·라이브 주소 모두 지원
    const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/)
    return m?.[1] ?? null
  }
  const youtubeId = getYoutubeId(business.youtube_url)
  // 대표 인사말 영상(유튜브) + 섹션 노출 여부
  const ownerVideoId = getYoutubeId(business.owner_video_url)
  const hasOwnerIntro = !!(business.owner_greeting || business.owner_photo_url || ownerVideoId)
  const minPrice = services && services.length > 0
    ? Math.min(...services.map((s) => s.base_price))
    : null

  // 지역 사다리 — 주소(동→구→시→도→권역) + 추가 출장 지역. AI 검색의 지역 매칭 신호.
  const areaServed = buildAreaServed(business.address, business.service_areas)

  // 전문성·신뢰 — 경력 연차 + 사업자등록번호 + 자격증/보유장비 (제안서 QR로 온 고객의 신뢰 앵커)
  const experienceYears = business.experience_years && business.experience_years > 0 ? business.experience_years : null
  const bizNumberDigits = (business.business_number ?? '').replace(/[^0-9]/g, '')
  const businessNumberFormatted =
    bizNumberDigits.length === 10
      ? `${bizNumberDigits.slice(0, 3)}-${bizNumberDigits.slice(3, 5)}-${bizNumberDigits.slice(5)}`
      : null
  const certifications = (business.certifications ?? []).filter((c) => c.trim())
  const hasCredentials = !!(experienceYears || businessNumberFormatted || certifications.length > 0)

  // 주 고객 유형 — B2B(상업공간 정기청소)면 공감·프로세스 카피를 상업 계약 톤으로 분기
  const isB2B = business.target_customer === 'b2b'

  // 공감 섹션 카피 — 따뜻한 리드(제안서 QR)의 실제 고민에 맞춤
  const empathy = isB2B
    ? {
        eyebrow: '이런 곳을 위해 준비했어요',
        heading: ['믿고 맡길 상업공간 청소,', '찾기 어려우셨죠?'],
        bullets: [
          '담당자가 매번 바뀌어 청소 품질이 들쭉날쭉했던 곳',
          '계약 후 검수·관리가 안 돼 클레임이 반복되던 곳',
          '업무에 지장 없이 사무실·상가·병원을 관리하고 싶은 곳',
          '세금계산서·정기 계약으로 깔끔하게 처리하고 싶은 곳',
        ],
        cta: '무료 방문견적 받기',
      }
    : {
        eyebrow: '이런 분들을 위해 준비했어요',
        heading: ['청소, 어디에 맡겨야', '할지 고민이세요?'],
        bullets: [
          '이사·입주 청소를 어디에 맡겨야 할지 막막하신 분',
          '청소 업체 가격이 적정한지 비교하기 어려우신 분',
          '당일 또는 빠른 날짜에 청소가 필요하신 분',
          '청소 후 결과물이 만족스럽지 않아 실망하신 분',
        ],
        cta: '지금 무료로 견적 받기',
      }

  // 프로세스 섹션 헤더 카피
  const processCopy = isB2B
    ? { eyebrow: '문의부터 정기 관리까지', heading: '믿고 맡기는 4단계', sub: '계약부터 검수·관리까지 깔끔하게 진행해요' }
    : { eyebrow: '간편한 예약 프로세스', heading: '예약부터 완료까지', sub: '복잡한 절차 없이 단 4단계면 충분해요' }

  // 우리만의 차이 — 사장님이 켠 강점을 우선 전시, 없으면 기본 카드로 폴백(하위 호환)
  const strengthCards =
    business.strengths && business.strengths.length > 0
      ? business.strengths
      : DEFAULT_STRENGTHS
  // 카드 아이콘 색상 순환 팔레트
  const strengthColors = [
    { iconColor: 'text-blue-600',    iconBg: 'bg-blue-50' },
    { iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50' },
    { iconColor: 'text-orange-600',  iconBg: 'bg-orange-50' },
    { iconColor: 'text-violet-600',  iconBg: 'bg-violet-50' },
    { iconColor: 'text-rose-600',    iconBg: 'bg-rose-50' },
    { iconColor: 'text-cyan-600',    iconBg: 'bg-cyan-50' },
  ]

  // SNS·외부 채널 링크 — 엔티티 통합(sameAs) + 하단 노출용
  const snsLinks = [
    { url: business.instagram_url, label: '인스타그램' },
    { url: business.youtube_url, label: '유튜브' },
    { url: business.naver_place_url, label: '네이버 플레이스' },
    { url: business.google_place_url, label: '구글 플레이스' },
    { url: business.kakao_place_url, label: '카카오맵' },
    { url: business.danggeun_review_url, label: '당근' },
  ].filter((s): s is { url: string; label: string } => !!s.url?.trim())
  const sameAs = snsLinks.map((s) => s.url)

  // JSON-LD 구조화 데이터 (GEO 최적화)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': `${appUrl}/biz/${slug}#business`,
        name: business.name,
        description: business.seo_description ?? business.description ?? '',
        telephone: business.phone ?? undefined,
        address: business.address
          ? { '@type': 'PostalAddress', streetAddress: business.address, addressCountry: 'KR' }
          : undefined,
        areaServed: areaServed.length > 0
          ? areaServed.map((name) => ({ '@type': 'AdministrativeArea', name }))
          : undefined,
        sameAs: sameAs.length > 0 ? sameAs : undefined,
        url: `${appUrl}/biz/${slug}`,
        image: `${appUrl}/og-image.png`,
        priceRange: minPrice ? `${minPrice.toLocaleString()}원~` : undefined,
        hasOfferCatalog: services && services.length > 0
          ? {
              '@type': 'OfferCatalog',
              name: '청소 서비스',
              itemListElement: services.map((s) => ({
                '@type': 'Offer',
                itemOffered: { '@type': 'Service', name: s.name },
                price: s.base_price,
                priceCurrency: 'KRW',
              })),
            }
          : undefined,
      },
      {
        '@type': 'WebPage',
        '@id': `${appUrl}/biz/${slug}`,
        url: `${appUrl}/biz/${slug}`,
        name: business.seo_title ?? business.name,
        description: business.seo_description ?? business.description ?? '',
        isPartOf: { '@id': appUrl },
      },
      ...(faqs.length > 0
        ? [{
            '@type': 'FAQPage',
            mainEntity: faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          }]
        : []),
    ],
  }

  // 예약/계약 프로세스 4단계 — B2B(상업공간 정기계약)는 문의→방문견적→계약→관리 톤으로 분기
  const processSteps = isB2B
    ? [
        {
          icon: ClipboardList,
          step: '01',
          title: '문의·현장 정보 전달',
          desc: '공간 종류와 면적, 원하는 주기를 남겨주세요',
          color: 'from-blue-500 to-blue-600',
        },
        {
          icon: Sparkles,
          step: '02',
          title: '방문 견적·시방 확인',
          desc: '현장을 보고 딱 맞는 견적과 작업 범위를 제안해요',
          color: 'from-violet-500 to-violet-600',
        },
        {
          icon: CalendarCheck,
          step: '03',
          title: '정기 계약 체결',
          desc: '고정 담당팀 배정, 세금계산서 발행까지 처리해요',
          color: 'from-emerald-500 to-emerald-600',
        },
        {
          icon: MessageCircle,
          step: '04',
          title: '검수·리포트 관리',
          desc: '작업 후 검수 결과를 카카오톡으로 보고드려요',
          color: 'from-yellow-500 to-orange-500',
        },
      ]
    : [
    {
      icon: ClipboardList,
      step: '01',
      title: '서비스 정보 입력',
      desc: '평수, 청소 종류, 원하는 날짜를 선택해요',
      color: 'from-blue-500 to-blue-600',
    },
    {
      icon: Sparkles,
      step: '02',
      title: '즉시 견적 확인',
      desc: '3가지 맞춤 견적을 바로 비교할 수 있어요',
      color: 'from-violet-500 to-violet-600',
    },
    {
      icon: CalendarCheck,
      step: '03',
      title: '간편 예약 확정',
      desc: '이름과 연락처만 입력하면 예약 완료예요',
      color: 'from-emerald-500 to-emerald-600',
    },
    {
      icon: MessageCircle,
      step: '04',
      title: '카카오 알림 수신',
      desc: '예약부터 방문 전 안내까지 카카오톡으로 받아요',
      color: 'from-yellow-500 to-orange-500',
    },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-white scroll-smooth" style={themeStyle}>

        {/* ── 헤더 ── */}
        <header className="border-b bg-white/95 backdrop-blur sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {business.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={business.logo_url} alt="" className="h-7 w-auto object-contain" />
              )}
              <span className="font-bold text-sm">{business.name}</span>
            </div>

            {/* 네비게이션 */}
            <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#services" className="hover:text-foreground transition-colors">서비스</a>
              <a href="#process" className="hover:text-foreground transition-colors">예약 방법</a>
              <a href="#faq" className="hover:text-foreground transition-colors">자주 묻는 질문</a>
              {recentPosts && recentPosts.length > 0 && (
                <Link
                  href={`/biz/${slug}/posts`}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  청소 정보
                </Link>
              )}
            </nav>

            <div className="flex items-center gap-2">
              {business.phone && (
                <a
                  href={`tel:${business.phone}`}
                  className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {business.phone}
                </a>
              )}
              <a href={primaryCta}>
                <Button size="sm" className="gap-1.5">
                  무료 견적 받기
                </Button>
              </a>
            </div>
          </div>
        </header>

        {/* ── 히어로 ── */}
        <section className={hero.section}>
          {/* 히어로 이미지 배경 (등록된 경우) */}
          {business.hero_image_url && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={business.hero_image_url}
                alt={business.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* 이미지 위에 어두운 오버레이 — 텍스트 가독성 확보 */}
              <div className="absolute inset-0 bg-black/55" />
            </>
          )}

          {/* 배경 장식 (이미지 없을 때만) */}
          {!business.hero_image_url && (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
              <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
              <div
                className="absolute bottom-0 left-0 w-96 h-96 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 opacity-15"
                style={{ backgroundColor: 'var(--brand-secondary)' }}
              />
              {!isLightHero && (
                <div
                  className="absolute inset-0 opacity-[0.025]"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                  }}
                />
              )}
            </>
          )}

          <div className="relative max-w-4xl mx-auto px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
            {/* 상단 뱃지 */}
            {minPrice && (
              <div className="inline-flex items-center gap-2 bg-primary/15 text-primary border border-primary/25 rounded-full px-4 py-1.5 text-xs font-semibold mb-6 sm:mb-8">
                <Sparkles className="h-3 w-3" />
                {minPrice.toLocaleString()}원부터 시작
              </div>
            )}

            {/* 헤드라인 — 모바일 text-balance, 데스크탑 한 줄 고정 */}
            <h1 className={`text-[2rem] sm:text-4xl lg:text-5xl xl:text-6xl font-black leading-tight lg:whitespace-nowrap text-balance lg:text-nowrap tracking-[-0.02em] mb-5 sm:mb-6 ${hero.title}`}>
              {business.hero_title ?? business.seo_title ?? business.name}
            </h1>

            {/* 서브타이틀 */}
            {(business.hero_subtitle ?? business.seo_description) && (
              <p className={`text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-8 sm:mb-10 ${hero.desc}`}>
                {business.hero_subtitle ?? business.seo_description}
              </p>
            )}

            {/* 위치 + 전화 */}
            {(business.address || business.phone) && (
              <div className="flex flex-wrap items-center justify-center gap-4 mb-8 sm:mb-10">
                {business.address && (
                  <span className={`flex items-center gap-1.5 text-sm ${hero.muted}`}>
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {business.address}
                  </span>
                )}
                {business.phone && (
                  <a href={`tel:${business.phone}`} className={`flex items-center gap-1.5 text-sm transition-colors ${hero.muted} ${hero.mutedHover}`}>
                    <Phone className="h-3.5 w-3.5 text-primary" />
                    {business.phone}
                  </a>
                )}
              </div>
            )}

            {/* 주 CTA — 히어로에선 버튼만 노출하고, 실제 견적 폼은 페이지 최하단(#lead-form)에 배치.
                설득 콘텐츠(후기·환불보장·특장점)를 먼저 보여준 뒤 폼으로 유도 — 버튼 클릭 시 최하단 폼으로 스크롤.
                서비스가 없으면(신규 업체 등) 기존 견적폼 링크로 폴백 */}
            <div className="flex justify-center">
              <a href={primaryCta} className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto gap-2 h-14 px-8 text-base font-bold shadow-xl shadow-primary/25 rounded-2xl">
                  <Star className="h-4 w-4" />
                  무료 견적 받기
                </Button>
              </a>
            </div>

            {/* 보조 CTA — 전화·네이버 플레이스 */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-4">
              {business.phone && (
                <a href={`tel:${business.phone}`} className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className={`w-full sm:w-auto h-12 px-6 text-sm bg-transparent gap-2 rounded-2xl ${hero.outlineBtn}`}>
                    <Phone className="h-4 w-4" />
                    전화 문의
                  </Button>
                </a>
              )}
              {business.naver_place_url && (
                <a href={business.naver_place_url} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className={`w-full sm:w-auto h-12 px-6 text-sm bg-transparent rounded-2xl ${hero.outlineBtn}`}>
                    네이버 플레이스
                  </Button>
                </a>
              )}
            </div>

            {/* 인라인 수치 뱃지 (모바일에서도 한 줄) */}
            <div className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-10 sm:mt-12 text-xs ${hero.muted}`}>
              {[
                { icon: Zap, text: '5분 이내 즉시 견적' },
                { icon: BadgeCheck, text: '3가지 가격 옵션' },
                { icon: MessageCircle, text: '카카오 자동 알림' },
              ].map(({ icon: Icon, text }) => (
                <span key={text} className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {text}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── 신뢰 배지 바 ── */}
        <section className="border-b bg-white/80 backdrop-blur-sm">
          <FadeIn>
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex items-center justify-start sm:justify-center gap-0 px-4 divide-x divide-slate-100 min-w-max sm:min-w-0 mx-auto">
              {[
                { icon: CheckCircle2, text: '즉시 견적 확인' },
                { icon: Clock, text: '빠른 방문 일정' },
                { icon: Shield, text: '전문 교육 청소팀' },
                { icon: ThumbsUp, text: '만족 보장' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground px-5 py-4 shrink-0">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <span className="whitespace-nowrap font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>
          </FadeIn>
        </section>

        {/* ── 전문성·신뢰 (경력·사업자 등록·자격증) — 제안서 QR로 온 고객의 신뢰 앵커 ── */}
        {hasCredentials && (
          <section className="border-b bg-white">
            <FadeIn>
            <div className="max-w-5xl mx-auto px-6 py-8 sm:py-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-5 sm:gap-10">
                {experienceYears && (
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-primary/10 shrink-0">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xl font-black leading-none">경력 {experienceYears}년</p>
                      <p className="text-xs text-muted-foreground mt-1">청소 전문 경력</p>
                    </div>
                  </div>
                )}
                {businessNumberFormatted && (
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-primary/10 shrink-0">
                      <BadgeCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">사업자 등록 업체</p>
                      <p className="text-xs text-muted-foreground mt-1">사업자등록번호 {businessNumberFormatted}</p>
                    </div>
                  </div>
                )}
              </div>

              {certifications.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {certifications.map((cert) => (
                    <span
                      key={cert}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary px-3 py-1.5 text-xs font-medium"
                    >
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {cert}
                    </span>
                  ))}
                </div>
              )}
            </div>
            </FadeIn>
          </section>
        )}

        {/* ── 대표 인사말 (얼굴·스토리·영상) — 초반 신뢰 앵커 ── */}
        {hasOwnerIntro && (
          <section className="py-20 sm:py-28 bg-slate-50">
            <FadeIn>
            <div className="max-w-4xl mx-auto px-6">
              <div className="text-center mb-10">
                <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">대표 인사말</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight">믿고 맡겨주세요</h2>
              </div>

              <div className="bg-white rounded-3xl p-7 sm:p-10 shadow-sm border border-slate-100">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  {business.owner_photo_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={business.owner_photo_url}
                      alt={business.owner_name ?? `${business.name} 대표`}
                      className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl object-cover shrink-0 shadow-sm"
                    />
                  )}
                  <div className="flex-1 text-center sm:text-left">
                    {business.owner_greeting && (
                      <p className="text-base sm:text-lg leading-relaxed text-slate-700 whitespace-pre-line">
                        {business.owner_greeting}
                      </p>
                    )}
                    {business.owner_name && (
                      <p className="mt-5 font-bold text-slate-900">
                        {business.owner_name}
                        <span className="ml-2 font-normal text-sm text-muted-foreground">{business.name}</span>
                      </p>
                    )}
                  </div>
                </div>

                {ownerVideoId && (
                  <div className="mt-8 rounded-2xl overflow-hidden aspect-video shadow-lg shadow-black/10">
                    <iframe
                      src={`https://www.youtube.com/embed/${ownerVideoId}?rel=0&modestbranding=1`}
                      title={`${business.name} 대표 인사말`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                )}
              </div>
            </div>
            </FadeIn>
          </section>
        )}

        {/* ── 고통 공감 섹션 ── */}
        <section className="py-20 sm:py-28 bg-white">
          <FadeIn>
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">{empathy.eyebrow}</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
                {empathy.heading[0]}<br className="sm:hidden" /> {empathy.heading[1]}
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
              {empathy.bullets.map((text) => (
                <div
                  key={text}
                  className="flex items-start gap-3 p-5 rounded-2xl bg-slate-50 hover:bg-primary/5 transition-colors"
                >
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span className="text-sm font-medium leading-relaxed text-slate-700">{text}</span>
                </div>
              ))}
            </div>

            <div className="text-center mt-10">
              <p className="text-muted-foreground text-sm mb-5">걱정 마세요. {business.name}이 도와드릴게요.</p>
              <a href={primaryCta}>
                <Button size="lg" className="gap-2 h-12 px-8 rounded-xl font-bold">
                  {empathy.cta}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
          </FadeIn>
        </section>

        {/* ── 예약 프로세스 (4단계) ── */}
        <section id="process" className="py-20 sm:py-28 bg-slate-50">
          <FadeIn>
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-14 sm:mb-16">
              <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">{processCopy.eyebrow}</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">{processCopy.heading}</h2>
              <p className="text-muted-foreground mt-3 text-base">{processCopy.sub}</p>
            </div>

            {/* 모바일: 2×2, 태블릿+: 4열 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
              {processSteps.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.step} className="flex flex-col items-center text-center p-5 sm:p-0">
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${item.color} text-white flex items-center justify-center mb-4 shadow-lg shadow-black/10`}>
                      <Icon className="h-6 w-6 sm:h-7 sm:h-7" />
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground mb-1.5 tracking-widest">STEP {item.step}</span>
                    <p className="font-bold text-sm sm:text-base mb-1.5 leading-snug">{item.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed hidden sm:block">{item.desc}</p>
                  </div>
                )
              })}
            </div>

            <div className="text-center mt-12">
              <a href={primaryCta}>
                <Button size="lg" className="gap-2 h-12 px-8 rounded-xl font-bold">
                  지금 바로 시작하기
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
          </FadeIn>
        </section>

        {/* ── 서비스 목록 ── */}
        {services && services.length > 0 && (
          <section id="services" className="py-20 sm:py-28 bg-white">
            <FadeIn>
            <div className="max-w-5xl mx-auto px-6">
              <div className="text-center mb-12">
                <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">제공 서비스</p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                  내 상황에 딱 맞는<br className="sm:hidden" /> 가격을 알려드려요
                </h2>
                <p className="text-muted-foreground mt-3 text-base">
                  평수와 상태를 입력하면 3가지 맞춤 견적을 바로 비교할 수 있어요
                </p>
              </div>

              <ServiceList services={services} quoteUrl={primaryCta} />
            </div>
            </FadeIn>
          </section>
        )}

        {/* ── YouTube 시공 영상 ── */}
        {youtubeId && (
          <section className="py-20 sm:py-28 bg-slate-50">
            <FadeIn>
            <div className="max-w-5xl mx-auto px-6">
              <div className="text-center mb-10">
                <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">실제 시공 영상</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight">직접 확인해보세요</h2>
                <p className="text-muted-foreground mt-3 text-base">말보다 영상이 확실해요</p>
              </div>
              <div className="max-w-3xl mx-auto rounded-3xl overflow-hidden shadow-2xl shadow-black/10 aspect-video">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`}
                  title={`${business.name} 시공 영상`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            </div>
            </FadeIn>
          </section>
        )}

        {/* ── 우리만의 차이 (사장님이 켠 강점 · 없으면 기본 카드) ── */}
        <section className="py-20 sm:py-28 bg-white">
          <FadeIn>
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-14">
              <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">선택하는 이유</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">{business.name}만의 차이</h2>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
              {strengthCards.map((item, idx) => {
                const Icon = getStrengthIcon(item.key)
                const color = strengthColors[idx % strengthColors.length]
                const number = String(idx + 1).padStart(2, '0')
                return (
                  <div
                    key={`${item.key}-${idx}`}
                    className="rounded-3xl p-7 sm:p-8 bg-slate-50 space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-12 h-12 rounded-2xl ${color.iconBg} flex items-center justify-center`}>
                        <Icon className={`h-6 w-6 ${color.iconColor}`} />
                      </div>
                      <span className="text-3xl font-black text-slate-100">{number}</span>
                    </div>
                    <p className="font-black text-lg tracking-tight">{item.title}</p>
                    {item.desc && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          </FadeIn>
        </section>

        {/* ── 시공 사례 갤러리 (비포·애프터) — 사장님이 홈 공개한 작업 보고 ── */}
        {portfolio.length > 0 && (
          <section id="portfolio" className="py-20 sm:py-28 bg-white">
            <FadeIn>
            <div className="max-w-5xl mx-auto px-6">
              <div className="text-center mb-12">
                <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">시공 사례</p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                  직접 작업한 현장이에요
                </h2>
                <p className="text-muted-foreground mt-3 text-base">저희가 직접 다녀온 실제 작업 현장이에요</p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {portfolio.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl overflow-hidden bg-slate-50 border border-slate-100"
                  >
                    {/* 작업 현장 2분할 */}
                    <div className="grid grid-cols-2">
                      <div className="relative aspect-square overflow-hidden">
                        <img
                          src={item.before ?? ''}
                          alt="작업 현장 사진"
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="relative aspect-square overflow-hidden">
                        <img
                          src={item.after ?? ''}
                          alt="작업 현장 사진"
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </FadeIn>
          </section>
        )}

        {/* ── 가격 안심 배너 ── */}
        <section className="py-12 sm:py-16 bg-primary/5">
          <FadeIn>
          <div className="max-w-5xl mx-auto px-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              {[
                { icon: BadgeCheck, title: '투명한 가격 안내', desc: '견적 확인 후 추가 비용 없이 그대로 진행돼요' },
                { icon: Clock, title: '빠른 방문 일정', desc: '원하는 날짜에 맞춰 방문 일정을 조율해드려요' },
                { icon: ThumbsUp, title: '만족 보장', desc: '청소 결과가 만족스럽지 않으면 다시 확인해드려요' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </FadeIn>
        </section>

        {/* ── 고객 후기 ── 실제 수집·인증된 후기만 전시(자작 추천사는 사용 안 함) */}
        {reviewSummary.items.length > 0 ? (
          <section className="py-20 sm:py-28 bg-slate-50">
            <FadeIn>
            <div className="max-w-5xl mx-auto px-6">
              <div className="text-center mb-12">
                <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">고객 후기</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight">실제 고객의 이야기</h2>
                {/* 평균 별점 + 후기 수 */}
                <div className="mt-4 inline-flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-5 w-5 ${i < Math.round(reviewSummary.avg) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                  <span className="text-lg font-bold">{reviewSummary.avg.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">· 후기 {reviewSummary.count}개</span>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
                {reviewSummary.items.map((r, idx) => (
                  <div key={idx} className="rounded-3xl bg-white p-7 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">&ldquo;{r.comment}&rdquo;</p>
                    <p className="text-xs text-muted-foreground font-medium">{r.customerName}님</p>
                  </div>
                ))}
              </div>
            </div>
            </FadeIn>
          </section>
        ) : null}

        {/* ── FAQ ── */}
        {faqs.length > 0 && (
          <section id="faq" className="py-20 sm:py-28 bg-white">
            <FadeIn>
            <div className="max-w-5xl mx-auto px-6">
              <div className="text-center mb-12">
                <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">궁금한 점</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight">자주 묻는 질문</h2>
              </div>
              <div className="max-w-2xl mx-auto space-y-3">
                {faqs.map((faq, idx) => (
                  <div key={idx} className="rounded-2xl bg-slate-50 p-5 space-y-2">
                    <p className="font-semibold text-sm">{faq.question}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
            </FadeIn>
          </section>
        )}

        {/* ── 최근 포스팅 (청소 정보) ── */}
        {recentPosts && recentPosts.length > 0 && (
          <section className="py-20 sm:py-28 bg-slate-50">
            <FadeIn>
            <div className="max-w-5xl mx-auto px-6">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <p className="text-primary font-semibold text-xs mb-2 tracking-widest uppercase">청소 전문 정보</p>
                  <h2 className="text-3xl sm:text-4xl font-black tracking-tight">청소 정보 & 노하우</h2>
                  <p className="text-muted-foreground mt-2">전문가가 알려주는 청소 꿀팁</p>
                </div>
                <Link
                  href={`/biz/${slug}/posts`}
                  className="text-sm text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  전체 보기 <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                {recentPosts.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/biz/${slug}/posts/${post.slug}`}
                    className="group block rounded-2xl bg-white p-6 hover:shadow-md transition-all"
                  >
                    <div className="h-1 w-8 bg-primary rounded-full mb-5 group-hover:w-14 transition-all duration-300" />
                    <p className="font-bold text-base leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-3">
                      {post.title}
                    </p>
                    {post.summary && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                        {post.summary}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-xs text-muted-foreground">
                        {new Date(post.published_at).toLocaleDateString('ko-KR')}
                      </p>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            </FadeIn>
          </section>
        )}

        {/* ── 하단 CTA — 실제 견적 폼(설득 콘텐츠를 다 본 뒤 이 자리에서 바로 신청).
            히어로·헤더·서비스목록·모바일 고정바의 모든 CTA가 이 #lead-form으로 스크롤됨 ── */}
        <section id="lead-form" className="scroll-mt-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-20 relative overflow-hidden">
          {/* 배경 장식 */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          <div className="relative max-w-5xl mx-auto px-4 text-center space-y-6">
            <div className="inline-flex items-center gap-2 bg-primary/20 text-primary border border-primary/30 rounded-full px-4 py-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4" />
              지금 바로 무료로 확인해보세요
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              {business.name}에<br className="sm:hidden" /> 견적을 요청하세요
            </h2>
            <p className="text-slate-300 text-lg">
              서비스 정보를 입력하면 즉시 3가지 견적을 확인할 수 있어요.
            </p>

            {/* 실제 견적 폼 — 설득 콘텐츠를 다 본 방문자가 위로 안 올라가고 이 자리에서 바로 신청.
                서비스가 없으면(신규 업체 등) 기존 견적폼 링크로 폴백 */}
            {formServices && formServices.length > 0 ? (
              <div className="pt-2">
                <HeroLeadForm
                  businessId={business.id}
                  businessName={business.name}
                  services={formServices}
                  channel={ch ?? null}
                />
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <a href={quoteHref}>
                  <Button size="lg" className="h-12 px-8 text-base font-bold gap-2 shadow-lg shadow-primary/30">
                    <Star className="h-4 w-4" />
                    무료 견적 받기
                  </Button>
                </a>
                {business.phone && (
                  <a href={`tel:${business.phone}`}>
                    <Button size="lg" variant="outline" className="h-12 px-8 text-base bg-transparent border-white/50 text-white hover:bg-white/10 hover:text-white gap-2">
                      <Phone className="h-4 w-4" />
                      {business.phone}
                    </Button>
                  </a>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── 푸터 ── */}
        <footer className="border-t bg-white pb-20 sm:pb-0">
          <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
            {/* SNS·외부 채널 — 엔티티 통합으로 검색·AI 신뢰도 향상 */}
            {snsLinks.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {snsLinks.map((sns) => (
                  <a
                    key={sns.url}
                    href={sns.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    {sns.label}
                  </a>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{business.name}</span>
              <span>
                Powered by{' '}
                <a href={appUrl} className="underline hover:text-foreground">퀄리오</a>
              </span>
            </div>
          </div>
        </footer>

      </div>

      {/* ── 모바일 하단 고정 CTA 바 ── */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3 flex items-center gap-3">
        {business.phone && (
          <a
            href={`tel:${business.phone}`}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border border-input text-sm font-semibold text-foreground"
          >
            <Phone className="h-4 w-4" />
            전화 문의
          </a>
        )}
        <a href={primaryCta} className={business.phone ? 'flex-1' : 'w-full'}>
          <Button className="w-full h-12 text-sm font-bold gap-2">
            <Star className="h-4 w-4" />
            무료 견적 받기
          </Button>
        </a>
      </div>
    </>
  )
}
