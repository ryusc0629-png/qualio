import { createSafeActionClient } from 'next-safe-action'

// next-safe-action 클라이언트 — 서버 액션 전체에서 공통으로 사용
export const action = createSafeActionClient()
