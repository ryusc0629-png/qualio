// 베타 100팀 평생 할인 — 광고에 나가는 약속의 기준값을 여기 한 곳에만 둔다.
//
// 약속 내용(광고 문구와 반드시 일치시킬 것):
//   - 선착순 100팀에게 가입 순번(베타 번호)을 부여한다.
//   - 그 100팀은 유료 전환 후에도 정가의 50%만 낸다(플랜을 올려도 같은 할인율).
//   - 번호는 가입 시점에 확정되고 이후 바뀌지 않는다.
//   - 해지 후 재가입·업체 양도 시에는 승계되지 않는다(할인은 businesses 행에 붙는다).
//
// 값을 바꾸면 이미 부여된 업체의 할인율은 그대로 남고, 이후 가입분부터 새 값이 적용된다.
// (이미 약속한 할인을 소급해서 깎지 않기 위함)

/** 평생 할인을 받는 베타 정원 */
export const BETA_SEATS = 100

/** 베타 참여 업체가 받는 평생 할인율 (%) */
export const BETA_LIFETIME_DISCOUNT_RATE = 50

/**
 * 정가에 평생 할인율을 적용한 실제 청구 금액.
 * 10원 단위로 내림해 결제창·영수증 금액이 지저분해지지 않게 한다.
 */
export function applyLifetimeDiscount(listPrice: number, discountRate: number): number {
  if (!discountRate || discountRate <= 0) return listPrice
  const rate = Math.min(100, Math.max(0, discountRate))
  return Math.floor((listPrice * (100 - rate)) / 100 / 10) * 10
}

/** 화면에 쓰는 짧은 라벨 — "베타 12번 · 평생 50% 할인" */
export function betaBadgeLabel(betaNumber: number | null, discountRate: number): string | null {
  if (!betaNumber) return null
  if (discountRate > 0) return `베타 ${betaNumber}번 · 평생 ${discountRate}% 할인`
  return `베타 ${betaNumber}번`
}
