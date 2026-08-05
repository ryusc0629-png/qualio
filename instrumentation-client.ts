// Sentry 클라이언트(브라우저) 오류 수집 초기화
// Next.js가 클라이언트 시작 시 자동으로 불러온다.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
})

// 페이지 이동(네비게이션) 추적 훅 — Sentry 권장
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
