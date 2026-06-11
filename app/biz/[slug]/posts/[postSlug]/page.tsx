import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  params: Promise<{ slug: string; postSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postSlug } = await params
  const db = createServiceClient()

  // 업체 + 포스트 조회
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

// 본문 텍스트를 단락/헤더로 렌더링하는 유틸 (마크다운 ## 헤더 지원)
function renderContent(content: string) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const text = paragraphLines.join(' ').trim()
      if (text) {
        elements.push(
          <p key={elements.length} className="text-muted-foreground leading-relaxed">
            {text}
          </p>
        )
      }
      paragraphLines = []
    }
  }

  lines.forEach((line) => {
    if (line.startsWith('## ')) {
      flushParagraph()
      elements.push(
        <h2 key={elements.length} className="text-lg font-bold mt-2">
          {line.replace(/^## /, '')}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      flushParagraph()
      elements.push(
        <h3 key={elements.length} className="font-semibold mt-1">
          {line.replace(/^### /, '')}
        </h3>
      )
    } else if (line.trim() === '') {
      flushParagraph()
    } else {
      paragraphLines.push(line)
    }
  })
  flushParagraph()

  return elements
}

export default async function PostPage({ params }: Props) {
  const { slug, postSlug } = await params
  const db = createServiceClient()

  // 업체 조회
  const { data: business } = await db
    .from('businesses')
    .select('id, name, phone, address, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!business) notFound()

  // 포스트 조회
  const { data: post } = await db
    .from('biz_posts')
    .select('id, title, content, summary, image_url, published_at, ai_generated')
    .eq('business_id', business.id)
    .eq('slug', postSlug)
    .eq('published', true)
    .maybeSingle()

  if (!post) notFound()

  // 같은 업체의 다른 포스트 (최근 3개)
  const { data: relatedPosts } = await db
    .from('biz_posts')
    .select('slug, title, published_at')
    .eq('business_id', business.id)
    .eq('published', true)
    .neq('slug', postSlug)
    .order('published_at', { ascending: false })
    .limit(3)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

  // JSON-LD Article 스키마
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.summary ?? '',
    datePublished: post.published_at,
    author: {
      '@type': 'Organization',
      name: business.name,
      url: `${appUrl}/biz/${slug}`,
    },
    publisher: {
      '@type': 'Organization',
      name: business.name,
      url: `${appUrl}/biz/${slug}`,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${appUrl}/biz/${slug}/posts/${postSlug}`,
    },
    ...(post.image_url ? { image: post.image_url } : {}),
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
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href={`/biz/${slug}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              {business.name}
            </Link>
            <Link href={`/q/${business.id}`}>
              <Button size="sm">견적 받기</Button>
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-10 space-y-10">

          {/* 포스트 헤더 */}
          <div className="space-y-3">
            <h1 className="text-2xl font-bold leading-tight">{post.title}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(post.published_at).toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </span>
              <span>{business.name}</span>
              {post.ai_generated && <span className="text-primary">AI 작성</span>}
            </div>
            {post.summary && (
              <p className="text-muted-foreground text-sm leading-relaxed border-l-4 border-primary/30 pl-3 italic">
                {post.summary}
              </p>
            )}
          </div>

          {/* 대표 이미지 */}
          {post.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.image_url}
              alt={post.title}
              className="w-full rounded-lg object-cover max-h-64"
            />
          )}

          {/* 본문 */}
          <article className="prose prose-sm max-w-none space-y-4">
            {renderContent(post.content)}
          </article>

          {/* CTA */}
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-6 text-center space-y-3">
            <p className="font-bold">{business.name}에 견적을 요청하세요</p>
            <Link href={`/q/${business.id}`}>
              <Button size="lg" className="w-full sm:w-auto">
                지금 바로 견적 받기 →
              </Button>
            </Link>
          </div>

          {/* 관련 포스트 */}
          {relatedPosts && relatedPosts.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-bold text-lg">다른 포스트</h2>
              <div className="space-y-2">
                {relatedPosts.map((rp) => (
                  <Link
                    key={rp.slug}
                    href={`/biz/${slug}/posts/${rp.slug}`}
                    className="block rounded-lg border bg-card p-3 hover:bg-accent transition-colors"
                  >
                    <p className="font-medium text-sm">{rp.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(rp.published_at).toLocaleDateString('ko-KR')}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </main>

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
