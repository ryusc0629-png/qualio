import { createServiceClient } from '@/lib/supabase/server'
import { notFound, permanentRedirect } from 'next/navigation'
import { isDomainIdentifier, bizBaseUrl, hasLiveCustomDomain } from '@/lib/domains/resolve'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock, MapPin, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BeforeAfterSlider } from '@/components/ui/before-after-slider'
import { detectViewSource } from '@/lib/utils/detect-view-source'
import { detectAiCrawler, recordAiCrawlerHit } from '@/lib/geo/crawler'
import { isBusinessInsiderViewing } from '@/lib/utils/track-page-view'
import { PhoneCallLink } from '@/components/biz/phone-call-link'

interface Props {
  params: Promise<{ slug: string; postSlug: string }>
}

interface FaqItem {
  question: string
  answer: string
}

interface PostMeta {
  keyPoints?: string[]
  faqs?: FaqItem[]
}

interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

// 본문에서 ## / ### 헤더 추출 → 목차 생성
function extractToc(content: string): TocItem[] {
  const lines = content.split('\n')
  const toc: TocItem[] = []
  lines.forEach((line) => {
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    if (h2) {
      const text = h2[1].trim()
      toc.push({ id: toAnchorId(text), text, level: 2 })
    } else if (h3) {
      const text = h3[1].trim()
      toc.push({ id: toAnchorId(text), text, level: 3 })
    }
  })
  return toc
}

// 헤더 텍스트 → anchor id
function toAnchorId(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w가-힣ㄱ-ㅎ-]/g, '')
    .slice(0, 50)
}

// 읽기 시간 계산 (한국어 기준 분당 500자)
function readingTime(content: string): number {
  const chars = content.replace(/\s/g, '').length
  return Math.max(1, Math.round(chars / 500))
}

// 마크다운 → React 요소 렌더링 (## 헤더 anchor 포함)
// **bold** 인라인 마크다운 → <strong> 변환
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : part
  )
}

function renderContent(content: string) {
  const blocks = content.split(/\n\n+/)
  return blocks.map((block, i) => {
    const trimmed = block.trim()
    if (!trimmed) return null

    if (trimmed.startsWith('## ')) {
      const text = trimmed.replace(/^## /, '')
      return (
        <h2 key={i} id={toAnchorId(text)} className="text-xl font-bold mt-10 mb-3 scroll-mt-20">
          {renderInline(text)}
        </h2>
      )
    }
    if (trimmed.startsWith('### ')) {
      const text = trimmed.replace(/^### /, '')
      return (
        <h3 key={i} id={toAnchorId(text)} className="text-base font-semibold mt-6 mb-2 scroll-mt-20">
          {renderInline(text)}
        </h3>
      )
    }

    // 리스트 블록
    const lines = trimmed.split('\n')
    const listLines = lines.filter((l) => l.trim().startsWith('- '))
    if (listLines.length > 0 && listLines.length === lines.filter(Boolean).length) {
      return (
        <ul key={i} className="space-y-2 my-4">
          {listLines.map((line, j) => (
            <li key={j} className="flex items-start gap-2.5 text-muted-foreground text-sm">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span className="leading-relaxed">{renderInline(line.replace(/^- /, ''))}</span>
            </li>
          ))}
        </ul>
      )
    }

    // 인용 블록 (> 로 시작)
    if (trimmed.startsWith('> ')) {
      return (
        <blockquote key={i} className="border-l-4 border-primary/40 pl-4 py-1 my-4 bg-muted/40 rounded-r-lg">
          <p className="text-sm text-muted-foreground italic leading-relaxed">
            {renderInline(trimmed.replace(/^> /, ''))}
          </p>
        </blockquote>
      )
    }

    return (
      <p key={i} className="text-muted-foreground text-sm leading-7">
        {renderInline(trimmed)}
      </p>
    )
  })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug, postSlug: rawPostSlug } = await params
  const slug = rawSlug.normalize('NFC') // 한글 주소 NFC/NFD 불일치 방지
  const postSlug = rawPostSlug.normalize('NFC')
  const db = createServiceClient()

  // [slug] 자리에는 slug가 올 수도, 고객사 도메인이 올 수도 있다(proxy가 rewrite)
  const column = isDomainIdentifier(slug) ? 'custom_domain' : 'slug'
  const { data: business } = await db
    .from('businesses')
    .select('id, name, seo_description, seo_keywords, address, slug, custom_domain, custom_domain_status' as never)
    .eq(column as never, slug as never)
    .maybeSingle() as unknown as { data: {
      id: string; name: string; seo_description: string | null
      seo_keywords: string | null; address: string | null
      slug: string | null; custom_domain: string | null; custom_domain_status: string | null
    } | null }

  if (!business) return { title: '포스트를 찾을 수 없습니다' }

  const { data: post } = await db
    .from('biz_posts')
    .select('title, summary, image_url, published_at')
    .eq('business_id', business.id)
    .eq('slug', postSlug)
    .eq('published', true)
    .maybeSingle()

  if (!post) return { title: '포스트를 찾을 수 없습니다' }

  const description = post.summary ?? business.seo_description ?? ''
  // 자체 도메인이 살아 있으면 그쪽이 정식 주소
  const canonicalUrl = `${bizBaseUrl(business)}/posts/${postSlug}`
  // 포스트 제목에서 키워드 추출 + 업체 키워드 병합
  const titleKeywords = post.title.replace(/[?!~·]/g, '').split(/[\s,]+/).filter(Boolean).slice(0, 5).join(', ')
  const keywords = [titleKeywords, business.seo_keywords].filter(Boolean).join(', ')

  return {
    title: `${post.title} | ${business.name}`,
    description,
    keywords,
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      url: canonicalUrl,
      // 사이트 이름은 업체명이어야 한다 — 퀄리오가 아니다.
      // 퍼플렉시티 같은 AI가 답변에 출처를 적을 때 이 값을 그대로 쓴다.
      // '퀄리오'로 두면 고객사 글이 인용돼도 손님에겐 우리 이름만 남고,
      // 정작 추천받아야 할 업체의 브랜드 신호가 약해진다.
      siteName: business.name,
      publishedTime: post.published_at,
      ...(post.image_url ? { images: [{ url: post.image_url }] } : {}),
    },
    twitter: { card: 'summary_large_image', title: post.title, description },
    alternates: { canonical: canonicalUrl },
  }
}

export default async function PostPage({ params }: Props) {
  const { slug: rawSlug, postSlug: rawPostSlug } = await params
  const slug = rawSlug.normalize('NFC') // 한글 주소 NFC/NFD 불일치 방지
  const postSlug = rawPostSlug.normalize('NFC')
  const db = createServiceClient()

  const viaCustomDomain = isDomainIdentifier(slug)
  const bizColumn = viaCustomDomain ? 'custom_domain' : 'slug'
  const { data: business } = await db
    .from('businesses')
    .select('id, name, phone, address, slug, custom_domain, custom_domain_status' as never)
    .eq(bizColumn as never, slug as never)
    .maybeSingle() as unknown as { data: {
      id: string; name: string; phone: string | null; address: string | null
      slug: string | null; custom_domain: string | null; custom_domain_status: string | null
    } | null }

  if (!business) {
    // 옛 업체 주소로 들어왔으면 현재 주소로 영구 이동(301) — 기존 링크 보존
    const { data: moved } = await db
      .from('businesses')
      .select('slug')
      .contains('previous_slugs' as never, [slug] as never)
      .maybeSingle() as unknown as { data: { slug: string | null } | null }
    if (moved?.slug) permanentRedirect(`/biz/${moved.slug}/posts/${postSlug}`)
    notFound()
  }

  // 자체 도메인이 살아 있는 업체를 퀄리오 주소로 열면 자체 도메인으로 영구 이동(중복 색인 방지)
  if (!viaCustomDomain && hasLiveCustomDomain(business)) {
    permanentRedirect(`https://${business.custom_domain}/posts/${postSlug}`)
  }

  // 페이지 안 링크의 앞부분 — 자체 도메인에서는 루트 기준이어야 한다
  const linkBase = viaCustomDomain ? '' : `/biz/${slug}`
  const homeHref = linkBase || '/'

  const { data: post } = await db
    .from('biz_posts')
    .select('id, title, content, summary, image_url, published_at, ai_generated, post_type, before_image_urls, after_image_urls' as never)
    .eq('business_id', business.id)
    .eq('slug', postSlug)
    .eq('published', true)
    .maybeSingle() as { data: {
      id: string; title: string; content: string; summary: string | null
      image_url: string | null; published_at: string; ai_generated: boolean
      post_type: string; before_image_urls: string[] | null; after_image_urls: string[] | null
    } | null }

  if (!post) notFound()

  // 조회 기록 — 업체 주인 본인 조회는 제외(테스트로 조회수 부풀림 방지)
  //
  // ⚠️ 예전엔 void로 던져 두고 기다리지 않았다. 서버리스에서는 응답이 끝나면 실행이 얼어붙어
  // 그 insert가 날아갔고, 그래서 글을 100편 넘게 발행하는 동안 post_views가 0행이었다.
  // 반드시 await 할 것. (실패해도 페이지는 떠야 하므로 try/catch로 감싼다)
  if (!(await isBusinessInsiderViewing(db, business.id))) {
    const headersList = await headers()
    const referer = headersList.get('referer') ?? ''
    const userAgent = headersList.get('user-agent') ?? ''
    const bot = detectAiCrawler(userAgent)
    try {
      if (bot) {
        // AI 크롤러 — 글 페이지가 크롤러가 가장 많이 오는 곳이다. 사람 조회수와 섞지 않는다.
        await recordAiCrawlerHit(db, business.id, bot)
      } else {
        await db
          .from('post_views')
          .insert({ post_id: post.id, business_id: business.id, source: detectViewSource(referer, userAgent) })
      }
    } catch (error) {
      console.error('[PostView] 조회 기록 실패:', error)
    }
  }

  const { data: relatedPosts } = await db
    .from('biz_posts')
    .select('slug, title, summary, published_at')
    .eq('business_id', business.id)
    .eq('published', true)
    .neq('slug', postSlug)
    .order('published_at', { ascending: false })
    .limit(3)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  // 이 글의 정식 주소 계열 — 자체 도메인이 살아 있으면 그쪽 기준
  const bizUrl = bizBaseUrl(business)
  const postUrl = `${bizUrl}/posts/${postSlug}`

  // JSON 메타 블록 파싱 (keyPoints, faqs)
  let keyPoints: string[] = []
  let inlineFaqs: FaqItem[] = []
  let mainContent = post.content

  const metaMatch = post.content.match(/^```json\n([\s\S]+?)\n```\n/)
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]) as PostMeta
      keyPoints = meta.keyPoints ?? []
      inlineFaqs = meta.faqs ?? []
      mainContent = post.content.slice(metaMatch[0].length)
    } catch {
      // 파싱 실패 시 원본 그대로
    }
  }

  const toc = extractToc(mainContent)
  const minutes = readingTime(mainContent)

  // JSON-LD — Article + FAQPage + BreadcrumbList
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        // 자체 도메인에서는 그 도메인이 곧 사이트라 '퀄리오 홈' 단계가 없다
        itemListElement: (hasLiveCustomDomain(business)
          ? [
              { name: business.name, item: bizUrl },
              { name: post.title, item: postUrl },
            ]
          : [
              { name: '홈', item: appUrl },
              { name: business.name, item: bizUrl },
              { name: post.title, item: postUrl },
            ]
        ).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
      },
      {
        '@type': 'Article',
        headline: post.title,
        description: post.summary ?? '',
        datePublished: post.published_at,
        dateModified: post.published_at,  // 최신성 신호 — AI 검색엔진 우선순위에 영향
        author: { '@type': 'Organization', name: business.name, url: bizUrl },
        publisher: { '@type': 'Organization', name: business.name, url: bizUrl },
        mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
        ...(post.image_url ? { image: post.image_url } : {}),
      },
      ...(inlineFaqs.length > 0
        ? [{
            '@type': 'FAQPage',
            mainEntity: inlineFaqs.map((faq) => ({
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

      <div className="min-h-screen bg-background">
        {/* 헤더 */}
        <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link
              href={homeHref}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {business.name}
            </Link>
            <Link href={`/q/${business.id}?ch=post`}>
              <Button size="sm">견적 받기</Button>
            </Link>
          </div>
        </header>

        {/* 대표 이미지 — 풀 와이드 */}
        {post.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.image_url}
            alt={post.title}
            className="w-full object-cover max-h-80"
          />
        )}

        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-12">

            {/* 메인 콘텐츠 */}
            <main className="min-w-0 space-y-8">

              {/* 브레드크럼 */}
              <nav className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <Link href={homeHref} className="hover:text-foreground transition-colors">
                  {business.name}
                </Link>
                <span>/</span>
                <span className="text-foreground">{post.title}</span>
              </nav>

              {/* 제목 + 메타 */}
              <div className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold leading-snug">{post.title}</h1>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(post.published_at).toLocaleDateString('ko-KR', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    약 {minutes}분 읽기
                  </span>
                  <span className="font-medium text-foreground">{business.name}</span>
                </div>
              </div>

              {/* 핵심 요약 박스 */}
              {(post.summary || keyPoints.length > 0) && (
                <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-5 space-y-2.5">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">이 글의 핵심</p>
                  {post.summary && (
                    <p className="text-sm font-medium leading-relaxed">{post.summary}</p>
                  )}
                  {keyPoints.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {keyPoints.map((pt, i) => (
                        <li key={i} className="text-sm text-muted-foreground">{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* 모바일 목차 — 항상 표시 */}
              {toc.length >= 3 && (
                <div className="lg:hidden rounded-lg border bg-card p-4">
                  <p className="text-sm font-semibold mb-3">목차</p>
                  <nav className="space-y-1.5">
                    {toc.map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className={`block text-xs text-muted-foreground hover:text-primary transition-colors ${item.level === 3 ? 'pl-3' : ''}`}
                      >
                        {item.text}
                      </a>
                    ))}
                  </nav>
                </div>
              )}

              {/* Before/After 슬라이더 — 포트폴리오 전용 */}
              {post.post_type === 'portfolio' &&
                post.before_image_urls?.[0] &&
                post.after_image_urls?.[0] && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">시공 전후 비교</p>
                  <BeforeAfterSlider
                    beforeUrl={post.before_image_urls[0]}
                    afterUrl={post.after_image_urls[0]}
                  />
                  <p className="text-[11px] text-center text-muted-foreground">
                    ← 드래그하여 시공 전후를 비교해보세요
                  </p>
                </div>
              )}

              {/* 본문 */}
              <article className="space-y-4">
                {renderContent(mainContent)}
              </article>

              {/* FAQ */}
              {inlineFaqs.length > 0 && (
                <section className="space-y-3 pt-4">
                  <h2 className="text-xl font-bold">자주 묻는 질문</h2>
                  <div className="space-y-3">
                    {inlineFaqs.map((faq, i) => (
                      <div key={i} className="rounded-lg border bg-card p-4 space-y-1.5">
                        <p className="text-sm font-semibold">{faq.question}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* CTA */}
              <section className="rounded-xl bg-primary/5 border border-primary/20 p-6 space-y-4">
                <div>
                  <p className="font-bold">{business.name}에 직접 문의하세요</p>
                  <p className="text-sm text-muted-foreground mt-0.5">무료 견적을 지금 바로 받아보세요.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Link href={`/q/${business.id}?ch=post`} className="flex-1">
                    <Button className="w-full">온라인 견적 받기 →</Button>
                  </Link>
                  {business.phone && (
                    <PhoneCallLink businessId={business.id} phone={business.phone} placement="post" className="flex-1">
                      <Button variant="outline" className="w-full gap-2">
                        <Phone className="h-4 w-4" />
                        {business.phone}
                      </Button>
                    </PhoneCallLink>
                  )}
                </div>
                {business.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {business.address}
                  </p>
                )}
              </section>

              {/* 다른 포스트 */}
              {relatedPosts && relatedPosts.length > 0 && (
                <section className="space-y-3">
                  <h2 className="font-bold text-lg">다른 청소 정보</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {relatedPosts.map((rp) => (
                      <Link
                        key={rp.slug}
                        href={`${linkBase}/posts/${rp.slug}`}
                        className="block rounded-lg border bg-card p-4 hover:bg-accent transition-colors group"
                      >
                        <p className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2">
                          {rp.title}
                        </p>
                        {rp.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rp.summary}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(rp.published_at).toLocaleDateString('ko-KR')}
                        </p>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

            </main>

            {/* 데스크톱 사이드바 목차 */}
            {toc.length >= 3 && (
              <aside className="hidden lg:block">
                <div className="sticky top-20 rounded-xl border bg-card p-5 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">목차</p>
                  <nav className="space-y-1.5">
                    {toc.map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className={`block text-xs text-muted-foreground hover:text-primary transition-colors leading-relaxed ${item.level === 3 ? 'pl-3 border-l border-border' : 'font-medium'}`}
                      >
                        {item.text}
                      </a>
                    ))}
                  </nav>
                </div>
              </aside>
            )}

          </div>
        </div>

        <footer className="border-t mt-16">
          <div className="max-w-5xl mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
            <p>
              이 페이지는{' '}
              <a href={appUrl} className="underline hover:text-foreground">퀄리오</a>를 통해 운영됩니다.
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}
