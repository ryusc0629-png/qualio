import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BookOpen, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const db = createServiceClient()

  const { data: business } = await db
    .from('businesses')
    .select('name, seo_description')
    .eq('slug', slug)
    .maybeSingle()

  if (!business) return { title: '업체를 찾을 수 없습니다' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  return {
    title: `청소 정보 & 노하우 | ${business.name}`,
    description: `${business.name}의 청소 전문 정보와 노하우를 확인하세요.`,
    alternates: { canonical: `${appUrl}/biz/${slug}/posts` },
  }
}

export default async function BizPostsPage({ params }: Props) {
  const { slug } = await params
  const db = createServiceClient()

  const { data: business } = await db
    .from('businesses')
    .select('id, name, phone')
    .eq('slug', slug)
    .maybeSingle()

  if (!business) notFound()

  const { data: posts } = await db
    .from('biz_posts')
    .select('slug, title, summary, published_at')
    .eq('business_id', business.id)
    .eq('published', true)
    .order('published_at', { ascending: false })

  return (
    <div className="min-h-screen bg-white">

      {/* ── 헤더 ── */}
      <header className="border-b bg-white/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href={`/biz/${slug}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {business.name}
          </Link>
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
              <Button size="sm">무료 견적 받기</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── 페이지 헤더 ── */}
      <section className="border-b bg-slate-50 py-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-2 text-primary mb-2">
            <BookOpen className="h-4 w-4" />
            <span className="text-sm font-semibold tracking-wide uppercase">청소 전문 정보</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">청소 정보 & 노하우</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {business.name} 전문가가 알려주는 청소 꿀팁과 유용한 정보
          </p>
        </div>
      </section>

      {/* ── 포스트 목록 ── */}
      <section className="max-w-4xl mx-auto px-4 py-10">
        {!posts || posts.length === 0 ? (
          // 빈 상태
          <div className="text-center py-20 space-y-3">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">아직 등록된 청소 정보가 없어요</p>
            <Link href={`/biz/${slug}`}>
              <Button variant="outline" className="mt-2">업체 홈으로 돌아가기</Button>
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-5">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/biz/${slug}/posts/${post.slug}`}
                className="group block rounded-2xl border-2 bg-white p-6 hover:shadow-lg hover:border-primary/40 transition-all"
              >
                {/* 컬러 포인트 바 */}
                <div className="h-1 w-10 bg-primary rounded-full mb-4 group-hover:w-16 transition-all duration-300" />
                <p className="font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-2">
                  {post.title}
                </p>
                {post.summary && (
                  <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                    {post.summary}
                  </p>
                )}
                <div className="flex items-center justify-between mt-5">
                  <p className="text-xs text-muted-foreground">
                    {new Date(post.published_at).toLocaleDateString('ko-KR')}
                  </p>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── 하단 CTA ── */}
      <section className="border-t bg-slate-50 py-10">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-bold">{business.name}에 견적을 요청해보세요</p>
            <p className="text-sm text-muted-foreground mt-0.5">5분 이내 즉시 견적 확인 가능해요</p>
          </div>
          <Link href={`/q/${business.id}`}>
            <Button className="gap-2 shrink-0">
              무료 견적 받기
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer className="border-t bg-white">
        <div className="max-w-4xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{business.name}</span>
          <span>
            Powered by{' '}
            <a href={process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'} className="underline hover:text-foreground">
              퀄리오
            </a>
          </span>
        </div>
      </footer>

    </div>
  )
}
