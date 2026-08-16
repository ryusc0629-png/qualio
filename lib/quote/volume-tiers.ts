// 규모 구간별 단가 — 평수(또는 개수)가 커지면 평당 단가를 낮춰 적용한다.
//
// 왜 필요한가:
//   평당 단가 하나로만 계산하면 250평 견적이 25,000 × 250 = 625만원으로 곧이곧대로 나온다.
//   실제 청소 견적은 규모가 커질수록 평당 단가가 내려가는데, 그게 반영이 안 되니
//   큰 문의일수록 화면 금액이 비현실적으로 커진다.
//
// 적용 방식은 '전체 적용'이다. 250평이고 구간이 [100평→22,000]이면
//   → 22,000 × 250평 (100평까지는 25,000, 나머지만 22,000으로 쪼개 더하는 누진이 아니다)
// 누진으로 하면 사장님이 머릿속으로 검산할 수 없어 "왜 이 금액이지?"가 된다.

export interface VolumeTier {
  /** 이 평수(개수)부터 아래 단가를 적용 */
  min_size: number
  /** 그 구간의 평당(개당) 단가 */
  price: number
}

/** DB에 저장된 jsonb를 안전한 배열로. 형식이 깨졌거나 비었으면 빈 배열 */
export function parseVolumeTiers(raw: unknown): VolumeTier[] {
  if (!Array.isArray(raw)) return []
  const tiers: VolumeTier[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const minSize = Number((row as { min_size?: unknown }).min_size)
    const price   = Number((row as { price?: unknown }).price)
    if (!Number.isFinite(minSize) || !Number.isFinite(price)) continue
    if (minSize <= 0 || price <= 0) continue
    tiers.push({ min_size: minSize, price })
  }
  // 큰 구간이 앞에 오도록 정렬 — 규모에 맞는 구간을 위에서부터 찾으면 된다
  return tiers.sort((a, b) => b.min_size - a.min_size)
}

/**
 * 이 규모에 실제로 적용할 평당(개당) 단가.
 * 해당하는 구간이 없으면 기본 단가를 그대로 쓴다(구간 미설정 업체는 기존 동작 그대로).
 */
export function unitPriceForSize(
  basePrice: number,
  tiers: VolumeTier[],
  size: number | null | undefined,
): number {
  if (!size || size <= 0 || tiers.length === 0) return basePrice
  const matched = tiers.find((t) => size >= t.min_size)
  return matched ? matched.price : basePrice
}

/**
 * 기본 단가 대비 몇 배로 적용되는지. 3단계 플랜의 직접 입력 단가에도 같은 비율로 반영해
 * 큰 건에서 기본 금액만 내려가고 플랜 금액은 그대로 남는 모순을 막는다.
 */
export function volumeRatioForSize(
  basePrice: number,
  tiers: VolumeTier[],
  size: number | null | undefined,
): number {
  if (basePrice <= 0) return 1
  return unitPriceForSize(basePrice, tiers, size) / basePrice
}
