// ────────────────────────────────────────────────────────────────────────────
// 월별 지표 스냅샷 — NRR(순매출유지율)·코호트 리텐션 기반 데이터
//
// daily-maintenance 크론이 매일 호출 → 현재 월(period) 행을 upsert.
// 같은 달은 계속 갱신되고, 달이 바뀌면 지난 달 행은 자연히 고정된다.
//
// NRR/코호트는 최소 2개월치 스냅샷이 쌓여야 의미가 생긴다(그 전엔 null 반환).
// ────────────────────────────────────────────────────────────────────────────

import { createServiceClient } from '@/lib/supabase/server'
import { createInternalClient } from '@/lib/supabase/internal'
import { getMarket } from '@/lib/i18n/locale'
import { getAdminMetrics, effectiveMrr } from '@/lib/admin/metrics'

// metrics_snapshots / business_mrr_snapshots 는 database.ts 타입에 아직 없어
// 제네릭 없는 internal 클라이언트로 접근하고, 결과는 명시 타입으로 단언한다.
const internalDb = createInternalClient

/** 마켓 타임존 기준 'YYYY-MM' (한국이면 KST) */
export function currentPeriod(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getMarket().timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const mo = parts.find((p) => p.type === 'month')?.value ?? '00'
  return `${y}-${mo}`
}

/**
 * 현재 월 스냅샷을 적재(upsert)한다. 크론에서 호출.
 * - business_mrr_snapshots: 업체별 현재 MRR (NRR/코호트용)
 * - metrics_snapshots: 플랫폼 집계 1행 (추이 차트용)
 */
export async function captureMonthlySnapshot(): Promise<{ period: string; businesses: number }> {
  const period = currentPeriod()
  const idb = internalDb()
  const db = createServiceClient()

  // 1) 업체별 현재 MRR — 한 업체에 구독행이 여러 개면 가장 큰 MRR 채택
  const { data: subs } = await db.from('subscriptions').select('business_id, plan, status')
  const perBiz = new Map<string, { plan: string; status: string; mrr: number }>()
  for (const s of subs ?? []) {
    const mrr = effectiveMrr(s.plan, s.status)
    const cur = perBiz.get(s.business_id)
    if (!cur || mrr > cur.mrr) perBiz.set(s.business_id, { plan: s.plan, status: s.status, mrr })
  }
  const rows = [...perBiz.entries()].map(([business_id, v]) => ({
    period,
    business_id,
    plan: v.plan,
    status: v.status,
    mrr: v.mrr,
  }))
  if (rows.length > 0) {
    await idb.from('business_mrr_snapshots').upsert(rows, { onConflict: 'period,business_id' })
  }

  // 2) 플랫폼 집계 스냅샷
  const m = await getAdminMetrics()
  await idb.from('metrics_snapshots').upsert(
    {
      period,
      total_businesses: m.growth.totalBusinesses,
      paying_businesses: m.revenue.payingBusinesses,
      mrr: m.revenue.mrr,
      contract_mrr: m.gmv.contractMrr,
      realized_gmv: m.gmv.realizedGmv,
      active_contracts: m.gmv.activeContracts,
      total_leads: m.pipeline.totalLeads,
      data: m,
      captured_at: new Date().toISOString(),
    },
    { onConflict: 'period' },
  )

  return { period, businesses: rows.length }
}

// ── 읽기(대시보드 표시용) ────────────────────────────────────────────────────

export interface NrrResult {
  current: string | null
  previous: string | null
  /** null = 데이터 부족(2개월 미만) */
  nrr: number | null
  cohortBusinesses: number // 이전 달 유료였던 업체 수
  retainedBusinesses: number // 그중 이번 달도 매출이 남은 업체 수
}

/** 최근 2개월 스냅샷으로 NRR을 계산한다. */
export async function computeNrr(): Promise<NrrResult> {
  const idb = internalDb()
  const { data: periodRows } = await idb
    .from('business_mrr_snapshots')
    .select('period')
    .order('period', { ascending: false })

  const periods = [...new Set(((periodRows ?? []) as { period: string }[]).map((r) => r.period))]
  if (periods.length < 2) {
    return {
      current: periods[0] ?? null,
      previous: null,
      nrr: null,
      cohortBusinesses: 0,
      retainedBusinesses: 0,
    }
  }

  const [current, previous] = periods
  const [{ data: curData }, { data: prevData }] = await Promise.all([
    idb.from('business_mrr_snapshots').select('business_id, mrr').eq('period', current),
    idb.from('business_mrr_snapshots').select('business_id, mrr').eq('period', previous),
  ])

  const curMap = new Map<string, number>()
  for (const r of (curData ?? []) as { business_id: string; mrr: number }[]) {
    curMap.set(r.business_id, Number(r.mrr) || 0)
  }
  const cohort = ((prevData ?? []) as { business_id: string; mrr: number }[]).filter(
    (r) => (Number(r.mrr) || 0) > 0,
  )
  const priorMrr = cohort.reduce((sum, r) => sum + (Number(r.mrr) || 0), 0)
  const retainedMrr = cohort.reduce((sum, r) => sum + (curMap.get(r.business_id) ?? 0), 0)
  const retainedBusinesses = cohort.filter((r) => (curMap.get(r.business_id) ?? 0) > 0).length

  return {
    current,
    previous,
    nrr: priorMrr > 0 ? retainedMrr / priorMrr : null,
    cohortBusinesses: cohort.length,
    retainedBusinesses,
  }
}

export interface MrrTrendPoint {
  period: string
  mrr: number
  payingBusinesses: number
}

/** 최근 N개월 MRR 추이(오래된 → 최신 순). */
export async function getMrrTrend(limit = 6): Promise<MrrTrendPoint[]> {
  const idb = internalDb()
  const { data } = await idb
    .from('metrics_snapshots')
    .select('period, mrr, paying_businesses')
    .order('period', { ascending: false })
    .limit(limit)

  const rows = (data ?? []) as { period: string; mrr: number; paying_businesses: number }[]
  return rows
    .map((r) => ({
      period: r.period,
      mrr: Number(r.mrr) || 0,
      payingBusinesses: Number(r.paying_businesses) || 0,
    }))
    .reverse()
}
