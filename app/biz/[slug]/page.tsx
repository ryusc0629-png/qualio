import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
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
import { buildBrandStyle, toBrandSettings } from '@/lib/brand'

interface Props {
  params: Promise<{ slug: string }>
}

interface FaqItem {
  question: string
  answer: string
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
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


export default async function BizLandingPage({ params }: Props) {
  const { slug } = await params
  const db = createServiceClient()

  const { data: business } = await db
    .from('businesses')
    .select('id, name, phone, address, description, seo_title, seo_description, seo_keywords, seo_faqs, naver_place_url, youtube_url, logo_url, hero_image_url, brand_color, brand_color_secondary, hero_style, hero_title, hero_subtitle, testimonials' as never)
    .eq('slug', slug)
    .maybeSingle() as { data: {
      id: string; name: string; phone: string | null; address: string | null
      description: string | null; seo_title: string | null; seo_description: string | null
      seo_keywords: string | null; seo_faqs: unknown; naver_place_url: string | null
      youtube_url: string | null
      logo_url: string | null; hero_image_url: string | null
      brand_color: string | null; brand_color_secondary: string | null
      hero_style: string | null; hero_title: string | null; hero_subtitle: string | null
      testimonials: { quote: string; author: string }[] | null
    } | null }

  if (!business) notFound()

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

  const [{ data: services }, { data: recentPosts }] = await Promise.all([
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
      .order('published_at', { ascending: false })
      .limit(3),
  ])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  const faqs = (business.seo_faqs as unknown as FaqItem[]) ?? []

  // YouTube URL → embed ID 추출
  function getYoutubeId(url: string | null): string | null {
    if (!url) return null
    const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)
    return m?.[1] ?? null
  }
  const youtubeId = getYoutubeId(business.youtube_url)
  const minPrice = services && services.length > 0
    ? Math.min(...services.map((s) => s.base_price))
    : null

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

  // 예약 프로세스 4단계
  const processSteps = [
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

      <div className="min-h-screen bg-white" style={themeStyle}>

        {/* ── 헤더 ── */}
        <header className="border-b bg-white/95 backdrop-blur sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            {business.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logo_url} alt={business.name} className="h-7 w-auto object-contain" />
            ) : (
              <span className="font-bold text-sm">{business.name}</span>
            )}

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
              <Link href={`/q/${business.id}`}>
                <Button size="sm" className="gap-1.5">
                  무료 견적 받기
                </Button>
              </Link>
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

            {/* CTA 버튼 — 모바일 풀 너비 */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link href={`/q/${business.id}`} className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto gap-2 h-14 px-8 text-base font-bold shadow-xl shadow-primary/25 rounded-2xl">
                  <Star className="h-4 w-4" />
                  무료 견적 받기
                </Button>
              </Link>
              {business.phone && (
                <a href={`tel:${business.phone}`} className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className={`w-full sm:w-auto h-14 px-7 text-base bg-transparent gap-2 rounded-2xl ${hero.outlineBtn}`}>
                    <Phone className="h-4 w-4" />
                    전화 문의
                  </Button>
                </a>
              )}
              {business.naver_place_url && (
                <a href={business.naver_place_url} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className={`w-full sm:w-auto h-14 px-7 text-base bg-transparent rounded-2xl ${hero.outlineBtn}`}>
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

        {/* ── 고통 공감 섹션 ── */}
        <section className="py-20 sm:py-28 bg-white">
          <FadeIn>
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">이런 분들을 위해 준비했어요</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
                청소, 어디에 맡겨야<br className="sm:hidden" /> 할지 고민이세요?
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
              {[
                '이사·입주 청소를 어디에 맡겨야 할지 막막하신 분',
                '청소 업체 가격이 적정한지 비교하기 어려우신 분',
                '당일 또는 빠른 날짜에 청소가 필요하신 분',
                '청소 후 결과물이 만족스럽지 않아 실망하신 분',
              ].map((text) => (
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
              <Link href={`/q/${business.id}`}>
                <Button size="lg" className="gap-2 h-12 px-8 rounded-xl font-bold">
                  지금 무료로 견적 받기
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
          </FadeIn>
        </section>

        {/* ── 예약 프로세스 (4단계) ── */}
        <section id="process" className="py-20 sm:py-28 bg-slate-50">
          <FadeIn>
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-14 sm:mb-16">
              <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">간편한 예약 프로세스</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">예약부터 완료까지</h2>
              <p className="text-muted-foreground mt-3 text-base">복잡한 절차 없이 단 4단계면 충분해요</p>
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
              <Link href={`/q/${business.id}`}>
                <Button size="lg" className="gap-2 h-12 px-8 rounded-xl font-bold">
                  지금 바로 시작하기
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
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

              <ServiceList services={services} quoteUrl={`/q/${business.id}`} />
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

        {/* ── 핵심 특장점 3가지 ── */}
        <section className="py-20 sm:py-28 bg-white">
          <FadeIn>
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-14">
              <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">선택하는 이유</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">{business.name}만의 차이</h2>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
              {[
                {
                  icon: Zap,
                  number: '01',
                  iconColor: 'text-blue-600',
                  iconBg: 'bg-blue-50',
                  title: '즉시 견적 확인',
                  desc: '복잡한 상담 없이 서비스 정보 입력 후 3가지 맞춤 견적을 바로 확인할 수 있어요.',
                },
                {
                  icon: Shield,
                  number: '02',
                  iconColor: 'text-emerald-600',
                  iconBg: 'bg-emerald-50',
                  title: '전문 청소팀',
                  desc: '체계적인 교육을 받은 전문 청소 인력이 꼼꼼하게 작업해요. 믿고 맡길 수 있어요.',
                },
                {
                  icon: MessageCircle,
                  number: '03',
                  iconColor: 'text-orange-600',
                  iconBg: 'bg-orange-50',
                  title: '카카오 알림톡',
                  desc: '예약 확정부터 방문 전 안내까지 카카오톡으로 자동 알림을 드려요.',
                },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.title}
                    className="rounded-3xl p-7 sm:p-8 bg-slate-50 space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-12 h-12 rounded-2xl ${item.iconBg} flex items-center justify-center`}>
                        <Icon className={`h-6 w-6 ${item.iconColor}`} />
                      </div>
                      <span className="text-3xl font-black text-slate-100">{item.number}</span>
                    </div>
                    <p className="font-black text-lg tracking-tight">{item.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                )
              })}
            </div>
          </div>
          </FadeIn>
        </section>

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

        {/* ── 고객 추천사 ── */}
        {business.testimonials && business.testimonials.length > 0 && (
          <section className="py-20 sm:py-28 bg-slate-50">
            <FadeIn>
            <div className="max-w-5xl mx-auto px-6">
              <div className="text-center mb-12">
                <p className="text-primary font-semibold text-xs mb-3 tracking-widest uppercase">고객 후기</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight">실제 고객의 이야기</h2>
              </div>
              <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
                {business.testimonials.map((t, idx) => (
                  <div key={idx} className="rounded-3xl bg-white p-7 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <p className="text-xs text-muted-foreground font-medium">{t.author}</p>
                  </div>
                ))}
              </div>
            </div>
            </FadeIn>
          </section>
        )}

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

        {/* ── 하단 CTA ── */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-20 relative overflow-hidden">
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
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href={`/q/${business.id}`}>
                <Button size="lg" className="h-12 px-8 text-base font-bold gap-2 shadow-lg shadow-primary/30">
                  <Star className="h-4 w-4" />
                  무료 견적 받기
                </Button>
              </Link>
              {business.phone && (
                <a href={`tel:${business.phone}`}>
                  <Button size="lg" variant="outline" className="h-12 px-8 text-base bg-transparent border-white/50 text-white hover:bg-white/10 hover:text-white gap-2">
                    <Phone className="h-4 w-4" />
                    {business.phone}
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ── 푸터 ── */}
        <footer className="border-t bg-white pb-20 sm:pb-0">
          <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{business.name}</span>
            <span>
              Powered by{' '}
              <a href={appUrl} className="underline hover:text-foreground">퀄리오</a>
            </span>
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
        <Link href={`/q/${business.id}`} className={business.phone ? 'flex-1' : 'w-full'}>
          <Button className="w-full h-12 text-sm font-bold gap-2">
            <Star className="h-4 w-4" />
            무료 견적 받기
          </Button>
        </Link>
      </div>
    </>
  )
}
