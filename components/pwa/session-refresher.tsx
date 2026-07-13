'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// 모바일 세션 유지 — 앱이 다시 화면에 보이는 순간 로그인 토큰을 즉시 갱신한다.
//
// 왜 필요한가: 로그인 토큰은 보안상 짧게(기본 1시간) 발급되고 만료 전에 자동 갱신돼야
// 로그인 상태가 유지된다. 이 자동 갱신은 '앱이 떠 있을 때 도는 타이머'로 작동하는데,
// 모바일은 앱을 백그라운드로 내리면 OS가 타이머를 멈춘다 → 토큰이 만료돼 로그아웃됨.
// 그래서 포그라운드로 돌아올 때마다 갱신 타이머를 다시 켜서(startAutoRefresh) 즉시 한 번
// 갱신하고, 백그라운드로 가면 꺼둔다(stopAutoRefresh). 알림을 눌러 앱을 다시 열 때도
// 이 시점에 세션이 살아나므로 재로그인 없이 바로 진입한다.
export function SessionRefresher() {
  useEffect(() => {
    const supabase = createClient()

    const sync = () => {
      if (document.visibilityState === 'visible') {
        // startAutoRefresh는 호출 즉시 만료 여부를 확인해 필요하면 바로 갱신한다
        void supabase.auth.startAutoRefresh()
      } else {
        void supabase.auth.stopAutoRefresh()
      }
    }

    sync() // 마운트 시 1회 (앱 진입/알림 클릭 진입 시점)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)

    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
      void supabase.auth.stopAutoRefresh()
    }
  }, [])

  return null
}
