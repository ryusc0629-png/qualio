import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Calendar, MapPin, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postSlug } = await params
  const db = createServiceClient()

  const { data: business } = await db
    .from('businesses')
    .select('id, name, seo_description')
    .eq('slug', slug)
    .maybeSingle()

  if (!business) return { title: '포스트를 찾을 수 없습니다' }

  const { data: post } = await db
    .from('biz_posts')
    .select('title, summary')
    .eq('business_id', business.id)
    .eq('slug', postSlug)
    .eq('published', true)
    .maybeSingle()

  if (!post) return { title: '포스트를 찾을 수 없습니다' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  const description = post.summary ?? business.seo_description ?? ''

  return {
    title: `${post.title} | ${business.name}`,
    description,
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      url: `${appUrl}/biz/${slug}/posts/${postSlug}`,
      siteName: '퀄리오',
    },
    twitter: { card: 'summary', title: post.title, description },
    alternates: { canonical: `${appUrl}/biz/${slug}/posts/${postSlug}` },
  }
}

// 마크다운 본문 → React 요소 렌더링
// ## 헤더, 리스트(-), 일반 단락 지원
function renderContent(content: string) {
  const blocks = content.split(/\n\n+/)
  return blocks.map((block, i) => {
    const trimmed = block.trim()
    if (!trimmed) return null

    // ## 헤더
    if (trimmed.startsWith('## ')) {
      return (
        <h2 key={i} className="text-lg font-bold mt-8 mb-3 text-foreground">
          {trimmed.replace(/^## /, '')}
        </h2>
      )
    }
    // ### 헤더
    if (trimmed.startsWith('### ')) {
      return (
        <h3 key={i} className="font-semibold mt-5 mb-2 text-foreground">
          {trimmed.replace(/^### /, '')}
        </h3>
      )
    }

    // 리스트 블록 (줄마다 - 로 시작)
    const listLines = trimmed.split('\n').filter((l) => l.trim().startsWith('- '))
    if (listLines.length > 0 && listLines.length === trimmed.split('\n').filter(Boolean).length) {
      return (
        <ul key={i} className="space-y-1.5 my-3">
          {listLines.map((line, j) => (
            <li key={j} className="flex items-start gap-2 text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span>{line.replace(/^- /, '')}</span>
            </li>
          ))}
        </ul>
      )
    }

    // 일반 단락
    return (
      <p key={i} className="text-muted-foreground leading-relaxed">
        {trimmed}
      </p>
    )
  })
}

export default async function PostPage({ params }: Props) {
  const { slug, postSlug } = await params
  const db = createServiceClient()

  const { data: business } = await db
    .from('businesses')
    .select('id, name, phone, address, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!business) notFound()

  const { data: post } = await db
    .from('biz_posts')
    .select('id, title, content, summary, image_url, published_at, ai_generated')
    .eq('business_id', business.id)
    .eq('slug', postSlug)
    .eq('published', true)
    .maybeSingle()

  if (!post) notFound()

  // 최근 포스트 3개 (관련 포스트)
  const { data: relatedPosts } = await db
    .from('biz_posts')
    .select('slug, title, published_at')
    .eq('business_id', business.id)
    .eq('published', true)
    .neq('slug', postSlug)
    .order('published_at', { ascending: false })
    .limit(3)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

  // content에서 keyPoints / faqs 파싱 시도 (AI가 JSON 메타를 앞에 붙인 경우 대비)
  // 일반적으로 content는 순수 마크다운이지만, 추후 확장 가능
  let keyPoints: string[] = []
  let inlineFaqs: FaqItem[] = []

  // content 앞부분에 JSON 메타 블록이 있으면 추출
  const metaMatch = post.content.match(/^```json\n([\s\S]+?)\n```\n/)
  let mainContent = post.content
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]) as PostMeta
      keyPoints = meta.keyPoints ?? []
      inlineFaqs = meta.faqs ?? []
      mainContent = post.content.slice(metaMatch[0].length)
    } catch {
      // 파싱 실패 시 그대로 사용
    }
  }

  // content 내 ## FAQ 섹션 추출 (마크다운 형식)
  const faqSectionMatch = mainContent.match(/## FAQ[\s\S]*$/)
  if (faqSectionMatch && inlineFaqs.length === 0) {
    const faqLines = faqSectionMatch[0].split('\n').filter(Boolean).slice(1)
    const parsedFaqs: FaqItem[] = []
    let currentQ = ''
    faqLines.forEach((line) => {
      if (line.startsWith('**Q')) {
        currentQ = line.replace(/^\*\*Q\d+[.:]\s*/, '').replace(/\*\*$/, '')
      } else if (line.startsWith('A:') || line.startsWith('**A:')) {
        if (currentQ) {
          parsedFaqs.push({ question: currentQ, answer: line.replace(/^\*\*?A:\s*/, '').replace(/\*\*$/, '') })
          currentQ = ''
        }
      }
    })
    if (parsedFaqs.length > 0) {
      inlineFaqs = parsedFaqs
      mainContent = mainContent.slice(0, mainContent.indexOf(faqSectionMatch[0])).trim()
    }
  }

  // JSON-LD — Article + FAQPage
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: post.title,
        description: post.summary ?? '',
        datePublished: post.published_at,
        author: { '@type': 'Organization', name: business.name, url: `${appUrl}/biz/${slug}` },
        publisher: { '@type': 'Organization', name: business.name, url: `${appUrl}/biz/${slug}` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${appUrl}/biz/${slug}/posts/${postSlug}` },
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
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link
              href={`/biz/${slug}`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {business.name}
            </Link>
            <Link href={`/q/${business.id}`}>
              <Button size="sm">견적 받기</Button>
            </Link>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">

          {/* 포스트 제목 + 메타 */}
          <div className="space-y-3">
            <h1 className="text-2xl font-bold leading-snug">{post.title}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(post.published_at).toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </span>
              <span>{business.name}</span>
            </div>
          </div>

          {/* 대표 이미지 */}
          {post.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.image_url}
              alt={post.title}
              className="w-full rounded-xl object-cover max-h-72"
            />
          )}

          {/* 핵심 요약 박스 — Inblog 스타일 */}
          {(post.summary || keyPoints.length > 0) && (
            <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-5 space-y-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">이 글의 핵심</p>
              {post.summary && (
                <p className="text-sm text-foreground leading-relaxed font-medium">{post.summary}</p>
              )}
              {keyPoints.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {keyPoints.map((pt, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{pt}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 본문 */}
          <article className="space-y-4 text-sm leading-7">
            {renderContent(mainContent)}
          </article>

          {/* FAQ 섹션 — AI 검색엔진 인용 핵심 */}
          {inlineFaqs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">자주 묻는 질문</h2>
              <div className="space-y-2">
                {inlineFaqs.map((faq, i) => (
                  <details key={i} className="group rounded-lg border bg-card">
                    <summary className="flex items-center justify-between p-4 cursor-pointer list-none text-sm font-medium">
                      <span className="pr-4">{faq.question}</span>
                      <span className="text-muted-foreground shrink-0 group-open:rotate-180 transition-transform">▾</span>
                    </summary>
                    <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* CTA 박스 */}
          <section className="rounded-xl bg-primary/5 border border-primary/20 p-6 space-y-4">
            <div className="space-y-1">
              <p className="font-bold">{business.name}에 직접 문의하세요</p>
              <p className="text-sm text-muted-foreground">무료로 견적을 받아보실 수 있습니다.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Link href={`/q/${business.id}`} className="flex-1">
                <Button className="w-full">온라인 견적 받기 →</Button>
              </Link>
              {business.phone && (
                <a href={`tel:${business.phone}`} className="flex-1">
                  <Button variant="outline" className="w-full gap-2">
                    <Phone className="h-4 w-4" />
                    {business.phone}
                  </Button>
                </a>
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
              <h2 className="font-bold">다른 청소 정보</h2>
              <div className="space-y-2">
                {relatedPosts.map((rp) => (
                  <Link
                    key={rp.slug}
                    href={`/biz/${slug}/posts/${rp.slug}`}
                    className="block rounded-lg border bg-card p-3 hover:bg-accent transition-colors group"
                  >
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">{rp.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(rp.published_at).toLocaleDateString('ko-KR')}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

        </main>

        <footer className="border-t mt-16">
          <div className="max-w-2xl mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
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
