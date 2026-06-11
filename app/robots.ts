import type { MetadataRoute } from 'next'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 대시보드, 인증, API는 크롤링 차단
        disallow: ['/dashboard/', '/api/', '/login', '/signup', '/onboarding', '/upgrade'],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  }
}
