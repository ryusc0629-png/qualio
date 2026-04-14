import { createSafeActionClient } from 'next-safe-action'

// next-safe-action 클라이언트 — 서버 액션 전체에서 공통으로 사용
// handleServerError: throw한 에러 메시지를 클라이언트에 그대로 전달
export const action = createSafeActionClient({
  handleServerError(e) {
    return e.message
  },
})
