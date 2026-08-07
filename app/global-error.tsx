'use client' // 에러 바운더리는 반드시 클라이언트 컴포넌트

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import './globals.css'

// 루트 레이아웃 자체가 깨졌을 때 대신 렌더되는 최후의 안내 화면.
// global-error는 루트 레이아웃을 대체하므로 반드시 <html>/<body>를 직접 포함해야 한다.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="ko">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <p className="text-4xl">😵</p>
          <h2 className="mt-4 text-lg font-bold">잠깐 문제가 생겼어요</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">
            화면을 여는 중에 오류가 났어요. 자동으로 저희에게 접수됐으니 곧 고쳐드릴게요.
            아래 버튼을 눌러 다시 시도해보세요.
          </p>
          <button
            onClick={() => reset()}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-emerald-600 px-5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            다시 시도하기
          </button>
        </div>
      </body>
    </html>
  )
}
