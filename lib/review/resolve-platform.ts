import type { createServiceClient } from '@/lib/supabase/server'

// 후기를 어느 채널로 보낼지 정하는 곳 — 화면(/review)과 저장(API)이 같은 판단을 쓰도록 한곳에 모은다.
// 두 곳이 갈라지면 손님에게는 구글을 보여주고 기록은 네이버로 남는 식으로 어긋난다.
//
// ── 왜 '구글 먼저'인가 ──
// ChatGPT·Gemini는 "울산 사무실 청소 추천" 같은 짧은 질문에 블로그가 아니라
// 구글 지도 데이터로 답한다. 그 후보에 들어가는 최소 조건이 리뷰 5개·평점 4.5다.
// 그런데 우리 고객 대부분은 리뷰를 네이버로만 보내 구글이 비어 있었다.
//
// 네이버를 버리는 게 아니다. 네이버 플레이스는 지금 실제 유입 1위 채널이다.
// 그래서 구글 5개를 채울 때까지만 구글로 보내고, 채우면 원래 채널로 자동 복귀한다.

/** AI 검색 후보에 들어가기 위한 최소 구글 리뷰 수 */
export const GOOGLE_REVIEW_TARGET = 5

export type ReviewPlatform = 'naver' | 'google' | 'danggeun' | 'kakao'

export interface ReviewPlatformInput {
  active_review_platform: string | null
  review_google_first?: boolean | null
  naver_place_url: string | null
  google_place_url: string | null
  danggeun_review_url: string | null
  kakao_place_url: string | null
}

export interface ResolvedPlatform {
  platform: ReviewPlatform | null
  url: string | null
  /** 지금 '구글 먼저' 모드로 보내고 있는지 (화면 안내·집계용) */
  googleFirstActive: boolean
}

/**
 * 후기 채널 결정.
 * @param googleClaimed 지금까지 구글로 보내 실제로 후기까지 남긴 건수
 */
export function resolveReviewPlatform(
  biz: ReviewPlatformInput,
  googleClaimed: number,
): ResolvedPlatform {
  const urls: Record<ReviewPlatform, string | null> = {
    naver: biz.naver_place_url,
    google: biz.google_place_url,
    danggeun: biz.danggeun_review_url,
    kakao: biz.kakao_place_url,
  }

  // 구글 먼저 — 링크가 있고, 아직 목표에 못 미쳤을 때만
  const googleFirstActive =
    biz.review_google_first !== false &&
    !!biz.google_place_url &&
    googleClaimed < GOOGLE_REVIEW_TARGET

  if (googleFirstActive) {
    return { platform: 'google', url: biz.google_place_url, googleFirstActive: true }
  }

  // 평소 채널 — 설정된 것 → 구글 → 네이버 순으로 살아 있는 링크를 쓴다
  const active = (biz.active_review_platform ?? 'naver') as ReviewPlatform
  const fallbackOrder: ReviewPlatform[] = [active, 'google', 'naver', 'danggeun', 'kakao']
  for (const p of fallbackOrder) {
    if (urls[p]) return { platform: p, url: urls[p], googleFirstActive: false }
  }
  return { platform: null, url: null, googleFirstActive: false }
}

/** 구글로 보내 실제로 후기까지 남긴 건수 */
export async function countGoogleClaims(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
): Promise<number> {
  const { count } = (await db
    .from('review_claims' as never)
    .select('id' as never, { count: 'exact', head: true })
    .eq('business_id' as never, businessId)
    .eq('platform' as never, 'google')
    .not('claimed_at' as never, 'is', null)) as unknown as { count: number | null }
  return count ?? 0
}
