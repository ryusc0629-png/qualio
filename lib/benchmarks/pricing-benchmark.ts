// 가격 벤치마크 — 3단계 플랜 가격 기준(%)과 "객단가 높은 업체" 실집계
//
// 두 가지를 담당한다.
//  1) 추천 플랜 인상률 기준선(퍼센트) — 금액이 아니라 "기본가 대비 몇 %" 로 판단한다.
//  2) 객단가 상위 업체들이 실제로 쓰는 인상률·플랜 구성 집계 (매일 cron 갱신).
//
// ★ 표본이 기준에 못 미치면 수치를 내보내지 않는다. 근거 없는 %를 화면에 띄우면
//   사장님 신뢰가 무너지므로, 데이터가 쌓이기 전까지는 문구 자체를 숨긴다.

import { createServiceClient } from '@/lib/supabase/server'
import type { PricingBenchmark } from '@/lib/benchmarks/pricing-band'

// 기준선(BETTER_UPLIFT_BAND 등)은 클라이언트 컴포넌트도 쓰므로 pricing-band.ts 에 있다.
export type { PricingBenchmark }

// ── 집계 기준 ────────────────────────────────────────────────────
// 표본이 이만큼 모이기 전에는 "상위 업체 평균 +N%" 문구를 만들지 않는다
const MIN_SAMPLE_BIZ = 10   // 객단가·플랜가격이 모두 있는 업체 수
const MIN_TOP_BIZ    = 5    // 상위 그룹 최소 업체 수
const MIN_BOOKINGS   = 3    // 업체별 객단가를 인정할 최소 예약 건수
const LOOKBACK_DAYS  = 365
const TOP_ITEMS_MAX  = 8    // 플랜별로 보여줄 인기 항목 개수

const median = (nums: number[]): number | null => {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** 문자열 배열들에서 많이 쓰인 순서로 상위 N개 뽑기 (표기 흔들림 방지: 앞뒤 공백만 정리) */
function topByFrequency(lists: string[][], limit: number): string[] {
  const count = new Map<string, number>()
  for (const list of lists) {
    // 같은 업체 안에서 중복 등록된 항목이 빈도를 부풀리지 않게 업체 단위로 유일화
    for (const raw of new Set(list.map((s) => s.trim()).filter(Boolean))) {
      count.set(raw, (count.get(raw) ?? 0) + 1)
    }
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
}

interface ServiceRow {
  business_id: string
  base_price: number
  tier_better_price: number | null
  tier_best_price: number | null
  tier_good_items: string[] | null
  tier_better_items: string[] | null
  tier_best_items: string[] | null
}

/**
 * 전체 업체 데이터를 훑어 벤치마크 1건을 계산한다. (cron에서 매일 호출)
 * 표본 미달이면 수치는 null, 항목은 빈 배열로 돌려준다 — 지어내지 않는다.
 */
export async function computePricingBenchmark(): Promise<PricingBenchmark> {
  const db = createServiceClient()
  const empty: PricingBenchmark = {
    sampleBiz: 0, topBiz: 0,
    topBetterUpliftPct: null, topBestUpliftPct: null, allBetterUpliftPct: null,
    topArpu: null, allArpu: null,
    topItems: { good: [], better: [], best: [] },
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // 1) 업체별 객단가 — 취소되지 않은 실제 금액이 있는 예약만
  const { data: bookingRows, error: bookingErr } = await db
    .from('bookings')
    .select('business_id, final_price')
    .gte('created_at', since)
    .neq('status', 'cancelled')
    .gt('final_price', 0)

  if (bookingErr) {
    console.error('[PricingBenchmark] 예약 집계 실패:', bookingErr.message)
    return empty
  }

  const arpuAgg = new Map<string, { sum: number; count: number }>()
  for (const b of bookingRows ?? []) {
    if (!b.business_id || !b.final_price) continue
    const cur = arpuAgg.get(b.business_id) ?? { sum: 0, count: 0 }
    cur.sum += b.final_price
    cur.count += 1
    arpuAgg.set(b.business_id, cur)
  }

  // 2) 업체별 추천·프리미엄 인상률 — 평당 3단계 플랜을 쓰는 서비스만
  const { data: svcRows, error: svcErr } = await db
    .from('service_items')
    .select(
      'business_id, base_price, tier_better_price, tier_best_price, tier_good_items, tier_better_items, tier_best_items' as never
    )
    .eq('unit', '평당')
    .is('deleted_at', null)
    .gt('base_price', 0) as unknown as { data: ServiceRow[] | null; error: { message: string } | null }

  if (svcErr) {
    console.error('[PricingBenchmark] 서비스 집계 실패:', svcErr.message)
    return empty
  }

  interface BizStat {
    betterUplifts: number[]
    bestUplifts: number[]
    goodItems: string[]
    betterItems: string[]
    bestItems: string[]
  }
  const bizStats = new Map<string, BizStat>()

  for (const s of svcRows ?? []) {
    if (!s.business_id || !s.base_price) continue
    const cur = bizStats.get(s.business_id) ?? {
      betterUplifts: [], bestUplifts: [], goodItems: [], betterItems: [], bestItems: [],
    }
    // 직접 입력한 플랜 가격만 인정 — 자동 배수(1.2/1.5)는 사장님이 고른 값이 아니라 기본값이라
    // 그대로 집계하면 "모두 +20%"라는 가짜 합의가 만들어진다.
    if (s.tier_better_price && s.tier_better_price > 0) {
      cur.betterUplifts.push((s.tier_better_price / s.base_price - 1) * 100)
    }
    if (s.tier_best_price && s.tier_best_price > 0) {
      cur.bestUplifts.push((s.tier_best_price / s.base_price - 1) * 100)
    }
    cur.goodItems.push(...(s.tier_good_items ?? []))
    cur.betterItems.push(...(s.tier_better_items ?? []))
    cur.bestItems.push(...(s.tier_best_items ?? []))
    bizStats.set(s.business_id, cur)
  }

  // 3) 표본 = 객단가(최소 건수 충족) + 추천 인상률이 둘 다 있는 업체
  const sample = [...bizStats.entries()]
    .map(([businessId, stat]) => {
      const arpuRow = arpuAgg.get(businessId)
      const betterUplift = median(stat.betterUplifts)
      if (!arpuRow || arpuRow.count < MIN_BOOKINGS || betterUplift === null) return null
      return {
        businessId,
        arpu: arpuRow.sum / arpuRow.count,
        betterUplift,
        bestUplift: median(stat.bestUplifts),
        stat,
      }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)

  const sampleBiz = sample.length
  if (sampleBiz < MIN_SAMPLE_BIZ) {
    // 아직 근거가 부족 — 업체 수만 기록해두고 수치는 비운다
    return { ...empty, sampleBiz }
  }

  // 4) 객단가 상위 1/3 (최소 MIN_TOP_BIZ곳)
  const sorted = [...sample].sort((a, b) => b.arpu - a.arpu)
  const topCount = Math.max(MIN_TOP_BIZ, Math.round(sampleBiz / 3))
  const top = sorted.slice(0, Math.min(topCount, sampleBiz))

  const topBetter = median(top.map((t) => t.betterUplift))
  const topBest = median(top.map((t) => t.bestUplift).filter((v): v is number => v !== null))
  const allBetter = median(sample.map((s) => s.betterUplift))

  return {
    sampleBiz,
    topBiz: top.length,
    topBetterUpliftPct: topBetter === null ? null : round1(topBetter),
    topBestUpliftPct: topBest === null ? null : round1(topBest),
    allBetterUpliftPct: allBetter === null ? null : round1(allBetter),
    topArpu: Math.round(top.reduce((a, t) => a + t.arpu, 0) / top.length),
    allArpu: Math.round(sample.reduce((a, s) => a + s.arpu, 0) / sampleBiz),
    topItems: {
      good:   topByFrequency(top.map((t) => t.stat.goodItems), TOP_ITEMS_MAX),
      better: topByFrequency(top.map((t) => t.stat.betterItems), TOP_ITEMS_MAX),
      best:   topByFrequency(top.map((t) => t.stat.bestItems), TOP_ITEMS_MAX),
    },
  }
}

// pricing_benchmarks 는 database.ts(수기 관리) 에 아직 없는 새 테이블 —
// 프로젝트 규칙대로 as never 로 단언해 접근한다.
const benchmarkTable = () =>
  (createServiceClient() as unknown as {
    from: (t: string) => ReturnType<ReturnType<typeof createServiceClient>['from']>
  }).from('pricing_benchmarks')

/** 계산 결과를 스냅샷으로 저장 (하루 1행) */
export async function savePricingBenchmark(b: PricingBenchmark): Promise<void> {
  const { error } = await benchmarkTable().insert({
    sample_biz: b.sampleBiz,
    top_biz: b.topBiz,
    top_better_uplift_pct: b.topBetterUpliftPct,
    top_best_uplift_pct: b.topBestUpliftPct,
    all_better_uplift_pct: b.allBetterUpliftPct,
    top_arpu: b.topArpu,
    all_arpu: b.allArpu,
    top_items: b.topItems,
  } as never)
  if (error) console.error('[PricingBenchmark] 스냅샷 저장 실패:', error.message)
}

/**
 * 화면에서 쓸 최신 스냅샷.
 * 상위 그룹 업체 수가 기준 미만이거나 수치가 없으면 null — 이때 UI는 문구를 숨긴다.
 */
export async function getLatestPricingBenchmark(): Promise<PricingBenchmark | null> {
  const { data, error } = await benchmarkTable()
    .select('*')
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle() as unknown as {
      data: {
        sample_biz: number; top_biz: number
        top_better_uplift_pct: number | null; top_best_uplift_pct: number | null
        all_better_uplift_pct: number | null
        top_arpu: number | null; all_arpu: number | null
        top_items: { good?: string[]; better?: string[]; best?: string[] } | null
      } | null
      error: { message: string } | null
    }

  if (error || !data) return null
  if (data.top_biz < MIN_TOP_BIZ || data.top_better_uplift_pct === null) return null

  return {
    sampleBiz: data.sample_biz,
    topBiz: data.top_biz,
    topBetterUpliftPct: Number(data.top_better_uplift_pct),
    topBestUpliftPct: data.top_best_uplift_pct === null ? null : Number(data.top_best_uplift_pct),
    allBetterUpliftPct: data.all_better_uplift_pct === null ? null : Number(data.all_better_uplift_pct),
    topArpu: data.top_arpu,
    allArpu: data.all_arpu,
    topItems: {
      good:   data.top_items?.good ?? [],
      better: data.top_items?.better ?? [],
      best:   data.top_items?.best ?? [],
    },
  }
}
