'use client'

import { useEffect } from 'react'

export function ScrollReset() {
  useEffect(() => {
    // 브라우저의 스크롤 위치 자동 복원을 끔 — 새로고침 시 항상 맨 위
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
  }, [])

  return null
}
