// 홍보 영상 요금 규칙 (서버·화면 공용).
//
// ⚠️금액은 전부 **공급가액(부가세 별도)**이다. 부가세는 청구 직전에 한 번만 얹는다
//    — 요금제와 같은 규칙(할인·집계는 공급가액으로, 부가세는 마지막에).

/**
 * 계정당 평생 무료 제작 편수.
 *
 * 월마다 주는 게 아니라 가입 후 통틀어 5편이다. 목적이 '맛보기'라서 —
 * 결과물을 보고 계속 쓸지 정하게 하는 게 전부다.
 */
export const REEL_FREE_QUOTA = 5

/**
 * 무료분을 다 쓴 뒤 한 편 값 (공급가액).
 *
 * 국내 릴스 제작 대행은 편당 7~10만원이다. 원가는 200원 안팎이라
 * 가격은 원가가 아니라 '계속 쓰게 되는 값'으로 잡았다.
 */
export const REEL_UNIT_PRICE = 4900

/** 이미 n편을 만든 업체가 다음 한 편에 낼 값 (공급가액) */
export function reelPriceFor(alreadyMade: number): number {
  return alreadyMade < REEL_FREE_QUOTA ? 0 : REEL_UNIT_PRICE
}
