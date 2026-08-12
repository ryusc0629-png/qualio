// 인터넷이 끊겨서 난 오류인지 판별 — 코드 버그와 구분하기 위한 단일 출처
//
// 왜 필요한가: 브라우저는 fetch가 네트워크 단계에서 실패하면 TypeError를 던지는데,
// 메시지가 브라우저마다 다르다(사파리 'Load failed', 크롬 'Failed to fetch',
// 파이어폭스 'NetworkError...'). 사장님들이 현장(지하 주차장·엘리베이터)에서 쓰면
// 수시로 발생하므로, 이걸 코드 오류와 같이 취급하면 진짜 버그가 알림에 묻힌다.
// 에러 화면 문구도 '고장'이 아니라 '연결 확인'으로 안내해야 한다.
// 브라우저가 직접 내는 영문 메시지만 매칭한다.
// 한국어 '연결' 같은 넓은 단어를 넣으면 '[APP] 결제 연결 실패' 같은 진짜 오류까지 묻힌다.
const NETWORK_ERROR_PATTERN =
  /load failed|failed to fetch|networkerror|network request failed|network connection was lost|the internet connection appears to be offline/i

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return NETWORK_ERROR_PATTERN.test(message)
}
