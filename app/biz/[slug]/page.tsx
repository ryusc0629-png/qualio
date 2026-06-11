import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Phone, Star, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  params: Promise<{ slug: string }>
}

interface FaqItem {
  question: string
  answer: string
}

// GEO 최적화 메타데이터 자동 생성
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
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `${appUrl}/biz/${slug}`,
    },
  }
}

export default async function BizLandingPage({ params }: Props) {
  const { slug } = await params
  const db = createServiceClient()

  // 업체 + 서비스 + SEO 데이터 병렬 조회
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
      .limit(5),
  ])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  const faqs = (business.seo_faqs as unknown as FaqItem[]) ?? []

  // JSON-LD 구조화 데이터 — AI 검색엔진 크롤링용
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      // LocalBusiness 스키마 — 위치 기반 검색 최적화
      {
        '@type': 'LocalBusiness',
        '@id': `${appUrl}/biz/${slug}#business`,
        name: business.name,
        description: business.seo_description ?? business.description ?? '',
        telephone: business.phone ?? undefined,
        address: business.address
          ? {
              '@type': 'PostalAddress',
              streetAddress: business.address,
              addressCountry: 'KR',
            }
          : undefined,
        url: `${appUrl}/biz/${slug}`,
        image: `${appUrl}/og-image.png`,
        priceRange: services && services.length > 0
          ? `${Math.min(...services.map((s) => s.base_price)).toLocaleString()}원~`
          : undefined,
        hasOfferCatalog: services && services.length > 0
          ? {
              '@type': 'OfferCatalog',
              name: '청소 서비스',
              itemListElement: services.map((s) => ({
                '@type': 'Offer',
                itemOffered: {
                  '@type': 'Service',
                  name: s.name,
                },
                price: s.base_price,
                priceCurrency: 'KRW',
                unitCode: s.unit,
              })),
            }
          : undefined,
      },
      // WebPage 스키마
      {
        '@type': 'WebPage',
        '@id': `${appUrl}/biz/${slug}`,
        url: `${appUrl}/biz/${slug}`,
        name: business.seo_title ?? business.name,
        description: business.seo_description ?? business.description ?? '',
        isPartOf: { '@id': appUrl },
      },
      // FAQ 스키마 — AI가 직접 인용하는 핵심 요소
      ...(faqs.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: faqs.map((faq) => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: faq.answer,
                },
              })),
            },
          ]
        : []),
    ],
  }

  return (
    <>
      {/* JSON-LD 구조화 데이터 삽입 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-background">
        {/* 헤더 */}
        <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Powered by 퀄리오</span>
            <Link href={`/q/${business.id}`}>
              <Button size="sm">견적 받기</Button>
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-10 space-y-12">

          {/* 히어로 섹션 */}
          <section className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">
                {business.seo_title ?? business.name}
              </h1>
              {business.seo_description && (
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {business.seo_description}
                </p>
              )}
            </div>

            {/* 업체 기본 정보 */}
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {business.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {business.address}
                </span>
              )}
              {business.phone && (
                <a
                  href={`tel:${business.phone}`}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  {business.phone}
                </a>
              )}
            </div>

            {/* CTA */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href={`/q/${business.id}`}>
                <Button size="lg" className="gap-2">
                  <Star className="h-4 w-4" />
                  무료 견적 받기
                </Button>
              </Link>
              {business.naver_place_url && (
                <a href={business.naver_place_url} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline">
                    네이버 플레이스 보기
                  </Button>
                </a>
              )}
            </div>
          </section>

          {/* 서비스 목록 */}
          {services && services.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">제공 서비스</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-lg border bg-card p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{service.name}</p>
                      {service.category && (
                        <p className="text-xs text-muted-foreground mt-0.5">{service.category}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-bold text-primary">
                        {service.base_price.toLocaleString()}원
                      </p>
                      <p className="text-xs text-muted-foreground">/{service.unit}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* FAQ 섹션 — AI 검색엔진 인용 핵심 */}
          {faqs.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">자주 묻는 질문</h2>
              <div className="space-y-3">
                {faqs.map((faq, idx) => (
                  <details
                    key={idx}
                    className="group rounded-lg border bg-card"
                  >
                    <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                      <span className="font-medium pr-4">{faq.question}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* 최근 포스팅 */}
          {recentPosts && recentPosts.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">청소 정보 & 노하우</h2>
              <div className="space-y-3">
                {recentPosts.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/biz/${slug}/posts/${post.slug}`}
                    className="block rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
                  >
                    <p className="font-medium">{post.title}</p>
                    {post.summary && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{post.summary}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(post.published_at).toLocaleDateString('ko-KR')}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 하단 CTA */}
          <section className="rounded-xl bg-primary/5 border border-primary/20 p-8 text-center space-y-4">
            <h2 className="text-xl font-bold">{business.name}에 견적을 요청하세요</h2>
            <p className="text-muted-foreground text-sm">
              서비스 정보를 입력하면 즉시 3가지 견적을 확인할 수 있습니다.
            </p>
            <Link href={`/q/${business.id}`}>
              <Button size="lg" className="w-full sm:w-auto">
                지금 바로 견적 받기 →
              </Button>
            </Link>
          </section>

        </main>

        {/* 푸터 */}
        <footer className="border-t mt-16">
          <div className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
            <p>
              이 페이지는{' '}
              <a href={appUrl} className="underline hover:text-foreground">
                퀄리오
              </a>
              를 통해 운영됩니다.
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}
