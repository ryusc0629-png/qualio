import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { isPlatformHost, stripWww } from '@/lib/domains/host'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host')?.toLowerCase().split(':')[0] ?? ''

  // 고객사 자체 도메인 — 그 도메인에는 업체 홈페이지만 있으므로 전부 열고,
  // 사이트맵도 그 도메인 것을 가리킨다(퀄리오 사이트맵을 가리키면 남의 주소를 신고하는 꼴).
  if (!isPlatformHost(host)) {
    const origin = `https://${stripWww(host)}`
    return {
      rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
      sitemap: `${origin}/sitemap.xml`,
      host: origin,
    }
  }

  const disallow = ['/dashboard/', '/api/', '/login', '/signup', '/onboarding', '/upgrade']

  return {
    rules: [
      // AI 검색 봇 명시적 허용 — GEO 인덱싱 우선순위 확보
      { userAgent: 'GPTBot', allow: '/', disallow },
      { userAgent: 'OAI-SearchBot', allow: '/', disallow },
      { userAgent: 'PerplexityBot', allow: '/', disallow },
      { userAgent: 'Google-Extended', allow: '/', disallow },
      { userAgent: 'ClaudeBot', allow: '/', disallow },
      // 일반 봇
      { userAgent: '*', allow: '/', disallow },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  }
}
