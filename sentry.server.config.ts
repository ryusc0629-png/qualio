// Sentry 서버(Node.js 런타임) 오류 수집 초기화
// 실서비스(Vercel)에서만 켜서 무료 등급 사용량을 아낀다 — 로컬 개발 오류는 터미널로 확인.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  // 성능 추적 표본율(0~1). 무료 등급 사용량 절약을 위해 낮게. 필요시 조정.
  tracesSampleRate: 0.1,
})
