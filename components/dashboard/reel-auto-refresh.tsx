'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 만드는 중인 홍보 영상이 있으면 화면을 스스로 갱신한다.
//
// 왜 필요한가: 영상이 완성되면 폰으로 알림은 가는데, 보고 있던 PC 화면은 "만드는 중이에요"에
// 그대로 멈춰 있었다. 완성된 걸 보려면 사장님이 직접 새로고침을 눌러야 했다.
// 알림을 받고 화면을 봤는데 안 바뀌어 있으면 고장 난 것처럼 보인다.
//
// ⚠️완성된 것만 있을 때는 이 컴포넌트를 붙이지 않는다 — 볼 일 없는 화면을 계속 두드릴 이유가 없다.

/** 몇 초마다 확인할지 — 제작에 30초쯤 걸리니 이 정도면 충분하다 */
const INTERVAL_MS = 8000
/** 이만큼 지나면 그만둔다. 실패했거나 사장님이 화면을 켜둔 채 자리를 비운 경우 */
const MAX_MS = 10 * 60 * 1000

export function ReelAutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - startedAt > MAX_MS) {
        clearInterval(timer)
        return
      }
      // 다른 탭을 보고 있으면 굳이 갱신하지 않는다(돌아오면 아래 리스너가 처리)
      if (document.visibilityState !== 'visible') return
      router.refresh()
    }, INTERVAL_MS)

    // 탭으로 돌아오는 순간이 가장 궁금한 때다 — 그때는 기다리지 않고 바로 갱신한다
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  return null
}
