import { describe, it, expect } from 'vitest'
import { visitBucket, isSearchSource, SEARCH_KEY, DIRECT_KEY } from '@/lib/marketing/visit-bucket'

// 방문을 어느 줄로 셀지 — 2026-08-22에 실제로 틀렸던 규칙이라 테스트로 고정한다.
//
// 무슨 일이 있었나: 광고 랜딩 URL에 ?ch=google_search를 심어뒀는데도 접속 경로를 먼저 봤다.
// 구글 광고를 타고 오면 referrer가 'google'이라, 돈 주고 데려온 손님이 그대로
// '광고 없이 검색으로 찾아온 손님'으로 세어졌다(운영 DB 기준 24건).
// ⛔이 테스트를 지우거나 완화하지 말 것.

const KNOWN = new Set(['naver_pl', 'google_search', 'post', 'youtube', 'danggeun'])

describe('채널 태그(?ch=)가 접속 경로보다 우선한다', () => {
  it('★구글 검색광고를 타고 왔으면 검색이 아니라 광고로 센다', () => {
    // referrer는 google이지만 ?ch=google_search가 붙어 있다 → 광고
    expect(visitBucket('google_search', 'google', KNOWN)).toBe('google_search')
  })

  it('★네이버 파워링크도 마찬가지', () => {
    expect(visitBucket('naver_pl', 'naver', KNOWN)).toBe('naver_pl')
  })

  it('자동발행 글 링크로 왔으면 그 채널로', () => {
    expect(visitBucket('post', 'daum', KNOWN)).toBe('post')
  })
})

describe('채널 태그가 없을 때만 접속 경로로 판정한다', () => {
  it('검색엔진에서 왔으면 검색', () => {
    expect(visitBucket(null, 'google', KNOWN)).toBe(SEARCH_KEY)
    expect(visitBucket(null, 'naver', KNOWN)).toBe(SEARCH_KEY)
    expect(visitBucket(null, 'daum', KNOWN)).toBe(SEARCH_KEY)
  })

  it('AI 검색에서 왔으면 검색', () => {
    expect(visitBucket(null, 'ai_chatgpt', KNOWN)).toBe(SEARCH_KEY)
  })

  it('그 외에는 직접·기타', () => {
    expect(visitBucket(null, 'direct', KNOWN)).toBe(DIRECT_KEY)
    expect(visitBucket(null, 'other', KNOWN)).toBe(DIRECT_KEY)
  })
})

describe('모르는 채널 값은 통계를 오염시키지 않는다', () => {
  it('아는 채널이 아니면 무시하고 접속 경로로 판정', () => {
    expect(visitBucket('누가심었는지모를값', 'google', KNOWN)).toBe(SEARCH_KEY)
    expect(visitBucket('누가심었는지모를값', 'direct', KNOWN)).toBe(DIRECT_KEY)
  })

  it('빈 문자열도 채널로 치지 않는다', () => {
    expect(visitBucket('', 'direct', KNOWN)).toBe(DIRECT_KEY)
  })
})

describe('isSearchSource', () => {
  it('검색엔진과 AI만 참', () => {
    expect(isSearchSource('google')).toBe(true)
    expect(isSearchSource('ai_chatgpt')).toBe(true)
    expect(isSearchSource('direct')).toBe(false)
    expect(isSearchSource('other')).toBe(false)
  })
})
