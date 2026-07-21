// Meta(페이스북·인스타그램) 픽셀 표준 이벤트 발송 — 클라이언트 전용.
// B2C 광고의 '전환 최적화'는 Meta가 전환을 알아야 가능 → 견적 퍼널 핵심 지점에서 호출.
// fbq 미로드(픽셀 ID 미설정·스크립트 로딩 전)면 조용히 무시 — 폼 흐름에 영향 없음.

type MetaStandardEvent = 'Lead' | 'CompleteRegistration' | 'Contact' | 'PageView'

export function trackMetaPixel(event: MetaStandardEvent, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq
    if (typeof fbq === 'function') fbq('track', event, params)
  } catch {
    // 추적 실패는 무시
  }
}
