'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// 대시보드 사용 행태 추적 — 화면(경로)이 바뀔 때마다 서버에 가볍게 1번 기록한다.
// 본사가 "회원들이 실제로 어떤 기능을 쓰는지" 보기 위한 신호. 추적 실패는 무시(화면에 영향 없음).
// 같은 경로를 연속으로 다시 기록하지 않도록 마지막 경로를 기억한다.
export function UsageTracker() {
  const pathname = usePathname()
  const lastRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || !pathname.startsWith('/dashboard')) return
    if (lastRef.current === pathname) return
    lastRef.current = pathname

    try {
      const body = JSON.stringify({ path: pathname })
      // sendBeacon은 같은 출처 쿠키(로그인 세션)를 함께 보내므로 서버에서 업체를 식별할 수 있다.
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track/activity', new Blob([body], { type: 'application/json' }))
      } else {
        void fetch('/api/track/activity', {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        })
      }
    } catch {
      // 추적 실패는 무시 — 사용 흐름에 영향 없음
    }
  }, [pathname])

  return null
}
