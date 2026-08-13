import { defineConfig } from 'vitest/config'
import path from 'node:path'

// 자동 테스트 설정 — 돈 계산·시각 변환처럼 눈으로 매번 확인하기 힘든 곳만 대상으로 한다.
// 실행: npm test
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 서버가 UTC(Vercel)여도 KST 변환이 맞는지 확인해야 하므로 UTC로 고정해 돌린다
    env: { TZ: 'UTC' },
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
})
