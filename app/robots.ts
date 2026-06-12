import type { MetadataRoute } from 'next'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

export default function robots(): MetadataRoute.Robots {
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
