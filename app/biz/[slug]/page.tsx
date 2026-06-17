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
import { isAcService } from '@/lib/utils'
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

// 서비스 카테고리별 이모지
function serviceEmoji(category: string | null, name: string): string {
  const text = (category ?? name).toLowerCase()
  if (isAcService(text)) return '❄️'
  if (text.includes('입주') || text.includes('이사')) return '🏠'
  if (text.includes('정기')) return '🔄'
  if (text.includes('사무') || text.includes('오피스')) return '🏢'
  if (text.includes('주방') || text.includes('부엌')) return '🍳'
  if (text.includes('욕실') || text.includes('화장실')) return '🚿'
  if (text.includes('창문') || text.includes('유리')) return '🪟'
  if (text.includes('카펫') || text.includes('소파')) return '🛋️'
  return '✨'
}

export default async function BizLandingPage({ params }: Props) {
  const { slug } = await params
  const db = createServiceClient()

  const { data: business } = await db
    .from('businesses')
    .select('id, name, phone, address, description, seo_title, seo_description, seo_keywords, seo_faqs, naver_place_url, logo_url, brand_color, brand_color_secondary, hero_style')
    .eq('slug', slug)
    .maybeSingle()

  if (!business) notFound()

  // ── 브랜드 테마 ── (CSS 변수 주입, AI 토큰과 무관)
  const brand = toBrandSettings(business)
  const themeStyle = buildBrandStyle(brand)
  const isLightHero = brand.heroStyle === 'light'
  // 히어로 dark/light 변형별 클래스
  const hero = {
    section: isLightHero
      ? 'relative overflow-hidden bg-gradient-to-br from-primary/10 via-white to-white'
      : 'relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
    title: isLightHero ? 'text-slate-900' : 'text-white',
    desc: isLightHero ? 'text-slate-600' : 'text-slate-300',
    muted: isLightHero ? 'text-slate-500' : 'text-slate-400',
    mutedHover: isLightHero ? 'hover:text-slate-900' : 'hover:text-white',
    statCard: isLightHero
      ? 'bg-white border border-slate-200 shadow-sm'
      : 'bg-white/8 backdrop-blur border border-white/10',
    statValue: isLightHero ? 'text-slate-900' : 'text-white',
    statSub: isLightHero ? 'text-slate-400' : 'text-slate-500',
    outlineBtn: isLightHero
      ? 'border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
      : 'border-white/50 text-white hover:bg-white/10 hover:text-white',
  }

  const [{ data: services }, { data: recentPosts }] = await Promise.all([
    db
      .from('service_items')
      .select('id, name, base_price, unit, category')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .eq('show_in_quote', true)
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
          {/* 배경 장식 — 라이트 블러 효과 */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/25 via-transparent to-transparent" />
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3" />
          {/* 서브 색상 글로우 */}
          <div
            className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 opacity-10"
            style={{ backgroundColor: 'var(--brand-secondary)' }}
          />

          {/* 격자 패턴 (어두운 배경에서만) */}
          {!isLightHero && (
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
          )}

          <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-28">
            <div className="flex flex-col lg:flex-row items-start gap-12">

              {/* 왼쪽: 텍스트 */}
              <div className="flex-1 max-w-xl space-y-6">
                {minPrice && (
                  <div className="inline-flex items-center gap-2 bg-primary/20 text-primary border border-primary/30 rounded-full px-3 py-1 text-xs font-semibold">
                    <Sparkles className="h-3 w-3" />
                    {minPrice.toLocaleString()}원부터 시작
                  </div>
                )}

                <h1 className={`text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight ${hero.title}`}>
                  {business.seo_title ?? business.name}
                </h1>

                {business.seo_description && (
                  <p className={`text-lg leading-relaxed ${hero.desc}`}>
                    {business.seo_description}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  {business.address && (
                    <span className={`flex items-center gap-1.5 text-sm ${hero.muted}`}>
                      <MapPin className="h-4 w-4 text-primary" />
                      {business.address}
                    </span>
                  )}
                  {business.phone && (
                    <a
                      href={`tel:${business.phone}`}
                      className={`flex items-center gap-1.5 text-sm transition-colors ${hero.muted} ${hero.mutedHover}`}
                    >
                      <Phone className="h-4 w-4 text-primary" />
                      {business.phone}
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Link href={`/q/${business.id}`}>
                    <Button size="lg" className="gap-2 h-12 px-6 text-base font-bold shadow-lg shadow-primary/30">
                      <Star className="h-4 w-4" />
                      무료 견적 받기
                    </Button>
                  </Link>
                  {business.naver_place_url && (
                    <a href={business.naver_place_url} target="_blank" rel="noopener noreferrer">
                      <Button size="lg" variant="outline" className={`h-12 px-5 text-base bg-transparent ${hero.outlineBtn}`}>
                        네이버 플레이스
                      </Button>
                    </a>
                  )}
                  {business.phone && (
                    <a href={`tel:${business.phone}`}>
                      <Button size="lg" variant="outline" className={`h-12 px-5 text-base bg-transparent gap-2 ${hero.outlineBtn}`}>
                        <Phone className="h-4 w-4" />
                        전화 문의
                      </Button>
                    </a>
                  )}
                </div>
              </div>

              {/* 오른쪽: 핵심 수치 카드 (시각화) */}
              <div className="lg:w-64 w-full grid grid-cols-2 lg:grid-cols-1 gap-3">
                {[
                  { icon: Zap, label: '즉시 견적', value: '5분 이내', sub: '서비스 정보만 입력' },
                  { icon: BadgeCheck, label: '가격 옵션', value: '3가지', sub: 'Good · Better · Best' },
                  { icon: MessageCircle, label: '예약 알림', value: '카카오톡', sub: '자동 발송' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-2xl p-4 space-y-1 ${hero.statCard}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <item.icon className="h-4 w-4 text-primary" />
                      <span className={`text-xs ${hero.muted}`}>{item.label}</span>
                    </div>
                    <p className={`font-bold text-lg leading-none ${hero.statValue}`}>{item.value}</p>
                    <p className={`text-xs ${hero.statSub}`}>{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 신뢰 배지 바 ── */}
        <section className="border-b bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
              {[
                { icon: CheckCircle2, text: '즉시 견적 확인' },
                { icon: Clock, text: '빠른 방문 일정' },
                { icon: Shield, text: '전문 교육 청소팀' },
                { icon: ThumbsUp, text: '만족 보장' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Icon className="h-4 w-4 text-primary" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 고통 공감 섹션 ── */}
        <section className="py-16 bg-white">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-10">
              <p className="text-primary font-semibold text-sm mb-2 tracking-wide uppercase">이런 분들을 위해 준비했어요</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold">
                청소, 어디에 맡겨야 할지<br className="sm:hidden" /> 고민이신가요?
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {[
                '이사·입주 청소를 어디에 맡겨야 할지 막막하신 분',
                '청소 업체 가격이 적정한지 비교하기 어려우신 분',
                '당일 또는 빠른 날짜에 청소가 필요하신 분',
                '청소 후 결과물이 만족스럽지 않아 실망하신 분',
              ].map((text) => (
                <div
                  key={text}
                  className="flex items-start gap-3 p-5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all"
                >
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span className="text-sm font-medium leading-relaxed">{text}</span>
                </div>
              ))}
            </div>

            {/* 공감 후 CTA */}
            <div className="text-center mt-10">
              <p className="text-muted-foreground text-sm mb-4">걱정 마세요. {business.name}이 도와드릴게요.</p>
              <Link href={`/q/${business.id}`}>
                <Button className="gap-2 px-6">
                  지금 무료로 견적 받기
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── 예약 프로세스 (4단계) ── */}
        <section id="process" className="py-16 bg-gradient-to-b from-slate-50 to-white">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-14">
              <p className="text-primary font-semibold text-sm mb-2 tracking-wide uppercase">간편한 예약 프로세스</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold">예약부터 완료까지</h2>
              <p className="text-muted-foreground mt-2 text-sm">복잡한 절차 없이 단 4단계면 충분해요</p>
            </div>

            <div className="relative">
              {/* 연결선 (데스크톱) */}
              <div className="hidden sm:block absolute top-8 left-[calc(12.5%+2rem)] right-[calc(12.5%+2rem)] h-0.5 bg-gradient-to-r from-blue-500 via-violet-500 via-emerald-500 to-orange-400 opacity-30" />

              <div className="grid sm:grid-cols-4 gap-8">
                {processSteps.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.step} className="flex flex-col items-center text-center relative z-10">
                      {/* 아이콘 원 */}
                      <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.color} text-white flex items-center justify-center mb-4 shadow-lg`}>
                        <Icon className="h-7 w-7" />
                      </div>
                      <span className="text-xs font-bold text-muted-foreground mb-1 tracking-wider">STEP {item.step}</span>
                      <p className="font-bold text-sm mb-1">{item.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="text-center mt-10">
              <Link href={`/q/${business.id}`}>
                <Button size="lg" className="gap-2 h-12 px-8 font-bold">
                  지금 바로 시작하기
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── 서비스 목록 ── */}
        {services && services.length > 0 && (
          <section id="services" className="py-16 bg-white">
            <div className="max-w-5xl mx-auto px-4">
              <div className="text-center mb-10">
                <p className="text-primary font-semibold text-sm mb-2 tracking-wide uppercase">제공 서비스</p>
                <h2 className="text-2xl sm:text-3xl font-extrabold">합리적인 가격, 전문 청소</h2>
                <p className="text-muted-foreground mt-2 text-sm">숨겨진 추가 비용 없이 투명하게 안내해드려요</p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="group rounded-2xl border-2 bg-white p-5 hover:border-primary hover:shadow-lg transition-all duration-200 cursor-default"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0 group-hover:bg-primary/20 transition-colors">
                          {serviceEmoji(service.category, service.name)}
                        </div>
                        <div>
                          <p className="font-bold text-sm">{service.name}</p>
                          {service.category && (
                            <p className="text-xs text-muted-foreground mt-0.5">{service.category}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-extrabold text-primary">
                          {service.base_price.toLocaleString()}원
                        </p>
                        <p className="text-xs text-muted-foreground">/{service.unit}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-center mt-8">
                <Link href={`/q/${business.id}`}>
                  <Button size="lg" className="gap-2 h-12 px-8 font-bold">
                    지금 바로 견적 받기
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── 핵심 특장점 3가지 ── */}
        <section className="py-16 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-10">
              <p className="text-primary font-semibold text-sm mb-2 tracking-wide uppercase">선택하는 이유</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold">{business.name}만의 차이</h2>
            </div>

            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  icon: Zap,
                  gradient: 'from-blue-50 to-blue-100',
                  iconColor: 'text-blue-600',
                  iconBg: 'bg-blue-100',
                  title: '즉시 견적 확인',
                  desc: '복잡한 상담 없이 서비스 정보 입력 후 3가지 맞춤 견적을 바로 확인할 수 있어요.',
                },
                {
                  icon: Shield,
                  gradient: 'from-emerald-50 to-emerald-100',
                  iconColor: 'text-emerald-600',
                  iconBg: 'bg-emerald-100',
                  title: '전문 청소팀',
                  desc: '체계적인 교육을 받은 전문 청소 인력이 꼼꼼하게 작업해요. 믿고 맡길 수 있어요.',
                },
                {
                  icon: MessageCircle,
                  gradient: 'from-yellow-50 to-orange-100',
                  iconColor: 'text-orange-600',
                  iconBg: 'bg-orange-100',
                  title: '카카오 알림톡',
                  desc: '예약 확정부터 방문 전 안내까지 카카오톡으로 자동 알림을 드려요.',
                },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.title}
                    className={`rounded-2xl p-6 bg-gradient-to-br ${item.gradient} border border-white space-y-4`}
                  >
                    <div className={`w-12 h-12 rounded-2xl ${item.iconBg} flex items-center justify-center`}>
                      <Icon className={`h-6 w-6 ${item.iconColor}`} />
                    </div>
                    <p className="font-extrabold text-base">{item.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── 가격 안심 배너 ── */}
        <section className="py-10 bg-primary/5 border-y border-primary/10">
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <BadgeCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-extrabold text-base">투명한 가격 안내</p>
                  <p className="text-sm text-muted-foreground">견적 확인 후 추가 비용 없이 그대로 진행돼요</p>
                </div>
              </div>
              <div className="hidden sm:block w-px h-12 bg-border" />
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-extrabold text-base">빠른 방문 일정</p>
                  <p className="text-sm text-muted-foreground">원하는 날짜에 맞춰 방문 일정을 조율해드려요</p>
                </div>
              </div>
              <div className="hidden sm:block w-px h-12 bg-border" />
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <ThumbsUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-extrabold text-base">만족 보장</p>
                  <p className="text-sm text-muted-foreground">청소 결과가 만족스럽지 않으면 다시 확인해드려요</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        {faqs.length > 0 && (
          <section id="faq" className="py-16 bg-white">
            <div className="max-w-5xl mx-auto px-4">
              <div className="text-center mb-10">
                <p className="text-primary font-semibold text-sm mb-2 tracking-wide uppercase">궁금한 점</p>
                <h2 className="text-2xl sm:text-3xl font-extrabold">자주 묻는 질문</h2>
              </div>
              <div className="max-w-2xl mx-auto space-y-3">
                {faqs.map((faq, idx) => (
                  <div key={idx} className="rounded-2xl border-2 bg-white p-5 space-y-2">
                    <p className="font-semibold text-sm">{faq.question}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 최근 포스팅 (청소 정보) ── */}
        {recentPosts && recentPosts.length > 0 && (
          <section className="py-16 bg-slate-50">
            <div className="max-w-5xl mx-auto px-4">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <p className="text-primary font-semibold text-sm mb-1 tracking-wide uppercase">청소 전문 정보</p>
                  <h2 className="text-2xl font-extrabold">청소 정보 & 노하우</h2>
                  <p className="text-sm text-muted-foreground mt-1">전문가가 알려주는 청소 꿀팁</p>
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
                    className="group block rounded-2xl border-2 bg-white p-5 hover:shadow-lg hover:border-primary/40 transition-all"
                  >
                    {/* 상단 컬러 포인트 */}
                    <div className="h-1 w-10 bg-primary rounded-full mb-4 group-hover:w-16 transition-all duration-300" />
                    <p className="font-bold text-sm leading-snug group-hover:text-primary transition-colors line-clamp-2">
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
        <footer className="border-t bg-white">
          <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{business.name}</span>
            <span>
              Powered by{' '}
              <a href={appUrl} className="underline hover:text-foreground">퀄리오</a>
            </span>
          </div>
        </footer>

      </div>
    </>
  )
}
