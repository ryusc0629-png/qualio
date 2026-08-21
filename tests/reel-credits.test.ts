import { describe, it, expect } from 'vitest'
import { estimateCredits } from '@/lib/creatomate/client'

// 홍보 영상 원가의 대부분은 편집 서비스 크레딧이다.
// 공식: 가로 × 세로 × fps × 초 ÷ 1억 (1크레딧 = 1억 픽셀, 최소 1크레딧)
// 이 계산이 틀리면 업체가 늘었을 때 청구서를 보고 나서야 원가를 알게 된다.

describe('홍보 영상 크레딧 계산', () => {
  it('Creatomate 문서 예시와 맞는다 — 1080×1920 30fps 30초 = 19크레딧', () => {
    expect(estimateCredits(1080, 1920, 30)).toBe(19)
  })

  it('실제 우리 영상 길이(28초)는 18크레딧', () => {
    expect(estimateCredits(1080, 1920, 28)).toBe(18)
  })

  it('해상도를 절반으로 낮추면 크레딧이 4분의 1 안팎이 된다', () => {
    const full = estimateCredits(1080, 1920, 28)
    const half = estimateCredits(540, 960, 28)
    expect(half).toBeLessThan(full / 3)
  })

  it('아주 짧은 영상도 최소 1크레딧', () => {
    expect(estimateCredits(1080, 1920, 0.1)).toBeGreaterThanOrEqual(1)
    expect(estimateCredits(10, 10, 0.1)).toBe(1)
  })

  it('길이에 비례한다', () => {
    expect(estimateCredits(1080, 1920, 60)).toBeCloseTo(estimateCredits(1080, 1920, 30) * 2, -1)
  })
})
