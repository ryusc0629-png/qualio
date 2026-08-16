// Sentry 클라이언트(브라우저) 오류 수집 초기화
// Next.js가 클라이언트 시작 시 자동으로 불러온다.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  // 인터넷 끊김으로 나는 오류는 접수하지 않는다.
  // 현장(지하 주차장·엘리베이터)에서 수시로 발생해 진짜 버그를 알림에 묻어버린다.
  // 메시지가 브라우저마다 달라 전부 나열한다(사파리 Load failed, 크롬 Failed to fetch 등).
  ignoreErrors: [
    'Load failed',
    'Failed to fetch',
    'NetworkError',
    'Network request failed',
    'The network connection was lost',
    'The Internet connection appears to be offline',
    'AbortError',
    // 페이스북·인스타 인앱 브라우저(안드로이드)가 자기 계측 스크립트에서 내는 오류.
    // 우리 코드와 무관하고 광고 유입이 늘수록 쏟아져 진짜 버그를 가린다.
    'Error invoking postMessage',
    'Java object is gone',
    'Java exception was raised',
  ],
  // 우리 도메인이 아닌 곳(인앱 브라우저 내부 스크립트 app://…)에서 난 오류는 접수하지 않는다.
  denyUrls: [/^app:\/\//],
})

// 페이지 이동(네비게이션) 추적 훅 — Sentry 권장
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
