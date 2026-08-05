// Next.js 서버 시작 훅 — 런타임별 Sentry 설정을 불러오고,
// 서버(App Router)에서 처리되지 않은 오류를 Sentry로 보고한다.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
