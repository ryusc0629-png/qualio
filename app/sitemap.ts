import type { MetadataRoute } from 'next'
import { createServiceClient } from '@/lib/supabase/server'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createServiceClient()

  // slug가 있는 업체 전체 조회
  const { data: businesses } = await db
    .from('businesses')
    .select('slug, updated_at')
    .not('slug', 'is', null)

  // 공개된 포스트 전체 조회 (업체 slug 포함)
  const { data: posts } = await db
    .from('biz_posts')
    .select('slug, published_at, businesses!business_id(slug)')
    .eq('published', true)
    .not('businesses.slug', 'is', null)

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: appUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${appUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]

  // 업체 랜딩 페이지
  const bizPages: MetadataRoute.Sitemap = (businesses ?? [])
    .filter((b) => b.slug)
    .map((b) => ({
      url: `${appUrl}/biz/${b.slug}`,
      lastModified: b.updated_at ? new Date(b.updated_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }))

  // 포스트 페이지
  const postPages: MetadataRoute.Sitemap = (posts ?? [])
    .filter((p) => {
      const biz = p.businesses as { slug: string } | null
      return biz?.slug && p.slug
    })
    .map((p) => {
      const bizSlug = (p.businesses as { slug: string }).slug
      return {
        url: `${appUrl}/biz/${bizSlug}/posts/${p.slug}`,
        lastModified: p.published_at ? new Date(p.published_at) : new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }
    })

  return [...staticPages, ...bizPages, ...postPages]
}
