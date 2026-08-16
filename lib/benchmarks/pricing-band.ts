// 3단계 플랜 가격 기준선 — 서버·클라이언트 공용 (DB 접근 없음)
//
// 판단은 항상 금액이 아니라 "기본가 대비 몇 %"로 한다.
// 기본가가 1만원이든 3만원이든 같은 잣대로 봐야 하기 때문.

/** 기본가 대비 추천 플랜 인상률(%) 권장 구간 */
export const BETTER_UPLIFT_BAND = { min: 15, max: 35 } as const

/** 추천 대비 프리미엄이 최소 이만큼(%)은 높아야 프리미엄이 프리미엄답게 보인다 */
export const MIN_PREMIUM_GAP_PCT = 12

/** 객단가 상위 업체 실집계 결과 — 표본 미달이면 화면에 내보내지 않는다 */
export interface PricingBenchmark {
  sampleBiz: number
  topBiz: number
  /** 상위 그룹의 기본가 대비 추천 인상률 중앙값(%) */
  topBetterUpliftPct: number | null
  topBestUpliftPct: number | null
  allBetterUpliftPct: number | null
  topArpu: number | null
  allArpu: number | null
  topItems: { good: string[]; better: string[]; best: string[] }
}
