import { describe, it, expect } from 'vitest'
import { resolveReviewPlatform, GOOGLE_REVIEW_TARGET } from '@/lib/review/resolve-platform'

// 이 판단이 틀리면 손님에게는 구글을 보여주고 기록은 네이버로 남거나,
// 반대로 지금 유입 1위인 네이버 리뷰가 영영 안 쌓인다. 규칙을 고정한다.

const 링크전부 = {
  naver_place_url: 'https://naver.example/place',
  google_place_url: 'https://google.example/review',
  danggeun_review_url: null,
  kakao_place_url: null,
}

describe('후기 채널 결정', () => {
  it('구글 리뷰가 목표에 못 미치면 구글로 보낸다', () => {
    const r = resolveReviewPlatform({ ...링크전부, active_review_platform: 'naver' }, 0)
    expect(r.platform).toBe('google')
    expect(r.googleFirstActive).toBe(true)
  })

  it('목표를 채우면 원래 채널(네이버)로 자동 복귀한다', () => {
    const r = resolveReviewPlatform({ ...링크전부, active_review_platform: 'naver' }, GOOGLE_REVIEW_TARGET)
    expect(r.platform).toBe('naver')
    expect(r.googleFirstActive).toBe(false)
  })

  it('경계에서 한 개 모자라면 아직 구글이다', () => {
    const r = resolveReviewPlatform({ ...링크전부, active_review_platform: 'naver' }, GOOGLE_REVIEW_TARGET - 1)
    expect(r.platform).toBe('google')
  })

  it('구글 먼저 모드를 끄면 설정한 채널을 그대로 쓴다', () => {
    const r = resolveReviewPlatform(
      { ...링크전부, active_review_platform: 'naver', review_google_first: false },
      0,
    )
    expect(r.platform).toBe('naver')
  })

  it('구글 링크가 없으면 구글로 보내지 않는다', () => {
    const r = resolveReviewPlatform(
      { ...링크전부, google_place_url: null, active_review_platform: 'naver' },
      0,
    )
    expect(r.platform).toBe('naver')
    expect(r.googleFirstActive).toBe(false)
  })

  it('설정한 채널의 링크가 비어 있으면 살아 있는 링크로 넘어간다', () => {
    const r = resolveReviewPlatform(
      { ...링크전부, google_place_url: null, naver_place_url: null, kakao_place_url: 'https://kakao.example', active_review_platform: 'naver' },
      0,
    )
    expect(r.platform).toBe('kakao')
  })

  it('보낼 곳이 하나도 없으면 null을 준다', () => {
    const r = resolveReviewPlatform(
      { naver_place_url: null, google_place_url: null, danggeun_review_url: null, kakao_place_url: null, active_review_platform: 'naver' },
      0,
    )
    expect(r.platform).toBeNull()
    expect(r.url).toBeNull()
  })
})
