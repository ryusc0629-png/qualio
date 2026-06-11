import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Phone, ChevronDown, CheckCircle2, Clock, Shield, Star, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
  if (text.includes('에어컨')) return '❄️'
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
    .select('id, name, phone, address, description, seo_title, seo_description, seo_keywords, seo_faqs, naver_place_url')
    .eq('slug', slug)
    .maybeSingle()

  if (!business) notFound()

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

  // JSON-LD 구조화 데이터
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-white">

        {/* ── 헤더 ── */}
        <header className="border-b bg-white/90 backdrop-blur sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="font-bold text-sm">{business.name}</span>
            <div className="flex items-center gap-2">
              {business.phone && (
                <a href={`tel:${business.phone}`} className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          {/* 배경 장식 */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-28">
            <div className="max-w-2xl space-y-6">
              {/* 뱃지 */}
              {minPrice && (
                <div className="inline-flex items-center gap-2 bg-primary/20 text-primary border border-primary/30 rounded-full px-3 py-1 text-xs font-medium">
                  <Sparkles className="h-3 w-3" />
                  {minPrice.toLocaleString()}원부터 시작
                </div>
              )}

              <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
                {business.seo_title ?? business.name}
              </h1>

              {business.seo_description && (
                <p className="text-lg text-slate-300 leading-relaxed">
                  {business.seo_description}
                </p>
              )}

              {/* 연락처 정보 */}
              <div className="flex flex-wrap gap-3">
                {business.address && (
                  <span className="flex items-center gap-1.5 text-sm text-slate-400">
                    <MapPin className="h-4 w-4 text-primary" />
                    {business.address}
                  </span>
                )}
                {business.phone && (
                  <a href={`tel:${business.phone}`} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
                    <Phone className="h-4 w-4 text-primary" />
                    {business.phone}
                  </a>
                )}
              </div>

              {/* CTA 버튼 */}
              <div className="flex flex-wrap gap-3 pt-2">
                <Link href={`/q/${business.id}`}>
                  <Button size="lg" className="gap-2 h-12 px-6 text-base shadow-lg shadow-primary/30">
                    <Star className="h-4 w-4" />
                    무료 견적 받기
                  </Button>
                </Link>
                {business.naver_place_url && (
                  <a href={business.naver_place_url} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" variant="outline" className="h-12 px-6 text-base border-white/20 text-white hover:bg-white/10">
                      네이버 플레이스
                    </Button>
                  </a>
                )}
                {business.phone && (
                  <a href={`tel:${business.phone}`}>
                    <Button size="lg" variant="outline" className="h-12 px-6 text-base border-white/20 text-white hover:bg-white/10 gap-2">
                      <Phone className="h-4 w-4" />
                      전화 문의
                    </Button>
                  </a>
                )}
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
                { icon: Star, text: '만족 보장' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Icon className="h-4 w-4 text-primary" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 서비스 목록 ── */}
        {services && services.length > 0 && (
          <section className="max-w-5xl mx-auto px-4 py-16">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold">제공 서비스</h2>
              <p className="text-muted-foreground mt-2">합리적인 가격으로 전문 청소 서비스를 제공합니다</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="group rounded-2xl border bg-white p-5 hover:border-primary hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">
                        {serviceEmoji(service.category, service.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{service.name}</p>
                        {service.category && (
                          <p className="text-xs text-muted-foreground mt-0.5">{service.category}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-primary text-sm">
                        {service.base_price.toLocaleString()}원
                      </p>
                      <p className="text-xs text-muted-foreground">/{service.unit}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 서비스 하단 CTA */}
            <div className="text-center mt-8">
              <Link href={`/q/${business.id}`}>
                <Button size="lg" className="gap-2">
                  지금 바로 견적 받기
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </section>
        )}

        {/* ── 왜 선택해야 하는가 ── */}
        <section className="bg-slate-50 py-16">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold">{business.name}을 선택하는 이유</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  emoji: '⚡',
                  title: '즉시 견적 확인',
                  desc: '서비스 정보 입력 후 3가지 맞춤 견적을 바로 확인할 수 있습니다.',
                },
                {
                  emoji: '🛡️',
                  title: '전문 청소팀',
                  desc: '체계적인 교육을 받은 전문 청소 인력이 꼼꼼하게 작업합니다.',
                },
                {
                  emoji: '💬',
                  title: '카카오 알림톡',
                  desc: '예약 확정부터 방문 전 안내까지 카카오톡으로 자동 알림을 드립니다.',
                },
              ].map((item) => (
                <div key={item.title} className="bg-white rounded-2xl p-6 text-center space-y-3 border">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl mx-auto">
                    {item.emoji}
                  </div>
                  <p className="font-bold">{item.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        {faqs.length > 0 && (
          <section className="max-w-5xl mx-auto px-4 py-16">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold">자주 묻는 질문</h2>
            </div>
            <div className="max-w-2xl mx-auto space-y-3">
              {faqs.map((faq, idx) => (
                <details key={idx} className="group rounded-2xl border bg-white">
                  <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                    <span className="font-medium text-sm pr-4">{faq.question}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* ── 최근 포스팅 ── */}
        {recentPosts && recentPosts.length > 0 && (
          <section className="bg-slate-50 py-16">
            <div className="max-w-5xl mx-auto px-4">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold">청소 정보 & 노하우</h2>
                  <p className="text-sm text-muted-foreground mt-1">전문가가 알려주는 청소 팁</p>
                </div>
                <Link href={`/biz/${slug}/posts`} className="text-sm text-primary hover:underline flex items-center gap-1">
                  전체 보기 <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {recentPosts.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/biz/${slug}/posts/${post.slug}`}
                    className="group block rounded-2xl border bg-white p-5 hover:shadow-md hover:border-primary transition-all"
                  >
                    <p className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {post.title}
                    </p>
                    {post.summary && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                        {post.summary}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-3">
                      {new Date(post.published_at).toLocaleDateString('ko-KR')}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 하단 CTA ── */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-20">
          <div className="max-w-5xl mx-auto px-4 text-center space-y-6">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
              <span className="relative text-4xl">✨</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              {business.name}에<br className="sm:hidden" /> 견적을 요청하세요
            </h2>
            <p className="text-slate-300 text-lg">
              서비스 정보를 입력하면 즉시 3가지 견적을 확인할 수 있습니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href={`/q/${business.id}`}>
                <Button size="lg" className="h-12 px-8 text-base gap-2 shadow-lg shadow-primary/30">
                  <Star className="h-4 w-4" />
                  무료 견적 받기
                </Button>
              </Link>
              {business.phone && (
                <a href={`tel:${business.phone}`}>
                  <Button size="lg" variant="outline" className="h-12 px-8 text-base border-white/20 text-white hover:bg-white/10 gap-2">
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
