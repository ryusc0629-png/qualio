import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { isPlatformHost, stripWww } from '@/lib/domains/host'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

interface PostRow {
  slug: string | null
  published_at: string | null
  businesses: { slug: string | null; custom_domain: string | null; custom_domain_status: string | null } | null
}

// 고객사 자체 도메인으로 요청된 사이트맵 — 그 업체의 페이지만 담는다.
// (다른 업체 주소를 남의 도메인 사이트맵에 넣으면 검색엔진이 그 사이트맵을 신뢰하지 않는다)
async function customDomainSitemap(host: string): Promise<MetadataRoute.Sitemap> {
  const db = createServiceClient()
  const domain = stripWww(host)
  const origin = `https://${domain}`

  const { data: business } = (await db
    .from('businesses')
    .select('id, updated_at' as never)
    .eq('custom_domain' as never, domain as never)
    .maybeSingle()) as unknown as { data: { id: string; updated_at: string | null } | null }

  if (!business) return []

  const { data: posts } = (await db
    .from('biz_posts')
    .select('slug, published_at')
    .eq('business_id', business.id)
    .eq('published', true)) as unknown as { data: { slug: string | null; published_at: string | null }[] | null }

  return [
    {
      url: origin,
      lastModified: business.updated_at ? new Date(business.updated_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 1.0,
    },
    {
      url: `${origin}/posts`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    ...(posts ?? [])
      .filter((p) => p.slug)
      .map((p) => ({
        url: `${origin}/posts/${p.slug}`,
        lastModified: p.published_at ? new Date(p.published_at) : new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      })),
  ]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host')?.toLowerCase().split(':')[0] ?? ''

  // 고객사 자체 도메인으로 들어온 요청이면 그 업체 전용 사이트맵
  if (!isPlatformHost(host)) return customDomainSitemap(host)

  const db = createServiceClient()

  // slug가 있는 업체 전체 조회
  const { data: businesses } = (await db
    .from('businesses')
    .select('slug, updated_at, custom_domain, custom_domain_status' as never)
    .not('slug', 'is', null)) as unknown as {
    data: { slug: string | null; updated_at: string | null; custom_domain: string | null; custom_domain_status: string | null }[] | null
  }

  // 공개된 포스트 전체 조회 (업체 slug 포함)
  const { data: posts } = (await db
    .from('biz_posts')
    .select('slug, published_at, businesses!business_id(slug, custom_domain, custom_domain_status)')
    .eq('published', true)
    .not('businesses', 'is', null)) as unknown as { data: PostRow[] | null }

  // 자체 도메인이 살아 있는 업체는 퀄리오 사이트맵에서 뺀다 —
  // 그 업체 페이지의 정식 주소는 자기 도메인 쪽이고, 퀄리오 주소는 그쪽으로 301된다.
  const isLive = (b: { custom_domain: string | null; custom_domain_status: string | null } | null) =>
    !!b?.custom_domain && b.custom_domain_status === 'active'

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
    .filter((b) => b.slug && !isLive(b))
    .map((b) => ({
      url: `${appUrl}/biz/${b.slug}`,
      lastModified: b.updated_at ? new Date(b.updated_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }))

  // 포스트 페이지
  const postPages: MetadataRoute.Sitemap = (posts ?? [])
    .filter((p) => p.businesses?.slug && p.slug && !isLive(p.businesses))
    .map((p) => ({
      url: `${appUrl}/biz/${p.businesses!.slug}/posts/${p.slug}`,
      lastModified: p.published_at ? new Date(p.published_at) : new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))

  return [...staticPages, ...bizPages, ...postPages]
}
