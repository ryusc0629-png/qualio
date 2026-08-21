// 이 서비스를 3단계 플랜(기본·추천·프리미엄)으로 안내할지 판정한다.
//
// ★기준은 **추천·프리미엄에 고유한 내용이 있는지**뿐이다.
//   기본 플랜만 채운 건 3단계를 팔겠다는 뜻이 아니다 — "이 서비스에 뭐가 포함되나"를
//   적는 자연스러운 행동이다.
//
// ⚠️왜 이걸 함수로 빼서 테스트로 고정하나:
//   예전엔 기본 항목만 있어도 3단계로 판정했다. 그러면 추천·프리미엄이 기본가 × 1.2 / × 1.5로
//   자동 생성돼 고객에게 나가는데, 정작 그 플랜에 **추가되는 항목이 한 줄도 없다.**
//   "기본보다 +36만원인데 뭐가 더 들어가는지 안 적힌" 카드가 되어 근거 없이 비싼 선택지로
//   읽히고, 업체가 의도한 적도 없는 금액이 나간다.
//   2026-08-21 다트클린 '상업시설 대청소'에서 실제로 발생(기본 5개만 적었는데 3단계 노출).

export interface TierConfigInput {
  tier_good_items?: string[] | null
  tier_better_items?: string[] | null
  tier_best_items?: string[] | null
  tier_good_price?: number | null
  tier_better_price?: number | null
  tier_best_price?: number | null
}

/**
 * 3단계로 안내할지 여부.
 *
 * ⛔기본 항목(tier_good_items)·기본 가격(tier_good_price)을 이 조건에 넣지 말 것.
 *   넣는 순간 "설정도 안 했는데 3단계가 나가는" 상태로 되돌아간다.
 */
export function shouldOfferTiers(service: TierConfigInput): boolean {
  return (
    (service.tier_better_items?.length ?? 0) > 0 ||
    (service.tier_best_items?.length   ?? 0) > 0 ||
    service.tier_better_price != null ||
    service.tier_best_price   != null
  )
}
