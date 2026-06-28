'use client'

// 견적 퍼널 추적 — 고객 브라우저에서 견적 폼 진행 단계를 익명 세션 단위로 기록
// 추적 실패가 폼 동작을 막지 않도록 모든 호출은 fire-and-forget(예외 무시)

const SESSION_KEY = 'qualio_funnel_sid'

// 잠재 고객의 전체 여정 이벤트
// 견적 폼: form_started / step_completed / quote_submitted
// 견적서: quote_viewed / plan_selected / address_entered / booking_submitted
export type FunnelEvent =
  | 'form_started'
  | 'step_completed'
  | 'quote_submitted'
  | 'quote_viewed'
  | 'plan_selected'
  | 'address_entered'
  | 'booking_submitted'

// 익명 세션 ID — 한 방문자의 여정을 묶는 키(개인정보 아님, 랜덤 UUID)
function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let sid = localStorage.getItem(SESSION_KEY)
    if (!sid) {
      sid = crypto.randomUUID()
      localStorage.setItem(SESSION_KEY, sid)
    }
    return sid
  } catch {
    return '' // 시크릿 모드 등 localStorage 차단 시 추적 생략
  }
}

export function trackFunnel(
  businessId: string,
  event: FunnelEvent,
  opts?: { step?: string; meta?: Record<string, string | number> },
): void {
  if (typeof window === 'undefined') return
  const sessionId = getSessionId()
  if (!sessionId) return

  const payload = JSON.stringify({ businessId, sessionId, event, step: opts?.step, meta: opts?.meta })
  try {
    // sendBeacon: 페이지 이탈(견적서로 이동) 중에도 끊기지 않고 전송
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track/funnel', new Blob([payload], { type: 'application/json' }))
    } else {
      void fetch('/api/track/funnel', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      })
    }
  } catch {
    // 추적 실패는 무시 — 폼 흐름에 영향 없음
  }
}
