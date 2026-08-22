import { isAiSource } from '@/lib/utils/detect-view-source'

// 방문 한 건을 어느 줄로 셀지 정하는 규칙 — '어디서 오고, 얼마가 됐나' 카드가 쓴다.
//
// ⚠️2026-08-22에 이 순서가 뒤집혀 있어서 유료 광고를 무료 검색으로 세고 있었다.
//   광고 랜딩 URL에 ?ch=google_search를 심어뒀는데도 접속 경로(referrer)를 먼저 봤고,
//   구글 광고를 타고 오면 referrer가 'google'이라 그대로 '검색으로 온 손님'이 됐다
//   (운영 DB에서 구글 검색광고 22건·네이버 파워링크 2건이 그렇게 새고 있었다).
//
// ★규칙: 채널 태그(?ch=)가 먼저다. 사장님이 직접 심어둔 표식이 referrer 추정보다 정확하다.
// ⛔순서를 뒤집지 말 것.

/** 검색·AI로 들어온 방문을 한 줄로 묶는 가짜 채널 키 */
export const SEARCH_KEY = '__search'
/** 채널도 모르고 검색도 아닌 방문 (주소 직접 입력·즐겨찾기 등) */
export const DIRECT_KEY = ''

const SEO_SOURCES = ['google', 'naver', 'daum']

/** 접속 경로가 검색·AI인지 */
export function isSearchSource(source: string): boolean {
  return isAiSource(source) || SEO_SOURCES.includes(source)
}

/**
 * 방문을 셀 줄(채널 키)을 고른다.
 *
 * @param channel  ?ch= 로 붙은 채널 태그 (없으면 null)
 * @param source   접속 경로 추정값 (google / naver / ai_chatgpt / direct / other …)
 * @param knownChannelKeys 우리가 아는 채널 키 — 모르는 값이 통계를 오염시키지 않게 거른다
 */
export function visitBucket(
  channel: string | null | undefined,
  source: string,
  knownChannelKeys: Set<string>,
): string {
  if (channel && knownChannelKeys.has(channel)) return channel
  if (isSearchSource(source)) return SEARCH_KEY
  return DIRECT_KEY
}
