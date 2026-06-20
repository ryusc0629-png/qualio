'use client'

import { useEffect } from 'react'

// 서비스워커 전역 등록 — 대시보드 어느 화면에 들어와도 1회 등록된다.
// 설정 페이지를 한 번도 안 들어가도 PWA 설치/푸시 알림이 동작하도록 보장.
// (register는 멱등 — 이미 등록돼 있으면 기존 등록을 재사용하므로 PushNotificationToggle과 충돌 없음)
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((e) => console.error('[PWA] 서비스워커 등록 실패:', e))
  }, [])

  return null
}
