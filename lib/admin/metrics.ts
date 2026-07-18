// ────────────────────────────────────────────────────────────────────────────
// 퀄리오 본사 내부 지표 — SaaS / M&A 데이터 레이어
//
// 왜 존재하는가:
//   투자 유치·M&A 실사에서 인수자/투자자가 보는 지표는 정해져 있다(매출 질·리텐션·GMV).
//   이 모듈이 그 지표를 Supabase 운영 데이터로부터 한 곳에서 계산한다.
//   /admin 페이지가 이걸 그대로 그려서 "본사 통합 관리 + IR 자료" 역할을 한다.
//
// 설계 원칙:
//   - 전 업체(크로스 테넌트) 집계이므로 createServiceClient(RLS 우회) 사용 — 관리자 전용.
//   - 베타 단계라 데이터가 적어도 깨지지 않게 방어적으로 계산(0 나눗셈 가드 등).
//   - 지표마다 "왜 보는가(M&A 의미)"를 주석으로 남겨, 책임 개발자가 맥락까지 인수받게 함.
// ────────────────────────────────────────────────────────────────────────────

import { createServiceClient } from '@/lib/supabase/server'
import { PLANS } from '@/lib/config/plans'
import { parseFrequency } from '@/lib/utils/frequency'

// ── 타입 정의 ────────────────────────────────────────────────────────────────

export interface PlanBreakdownRow {
  plan: string
  label: string
  count: number
  mrr: number
}

export interface AdminMetrics {
  generatedAt: string

  /** 성장 — 퍼널 최상단(가입)과 활성화 */
  growth: {
    totalBusinesses: number
    newBusinessesThisMonth: number
    activeBusinesses: number // 견적·예약·고객 중 1건 이상 보유
    activationRate: number // 활성 / 전체
    acquisitionBreakdown: { source: string; label: string; count: number }[] // 가입 경로별 분포
  }

  /** 매출 — 밸류에이션의 출발점(ARR × 멀티플) */
  revenue: {
    payingBusinesses: number
    mrr: number
    arr: number
    arpa: number // 유료 업체당 평균 월매출
    planBreakdown: PlanBreakdownRow[]
  }

  /** 리텐션 — 멀티플을 결정하는 핵심(전환·이탈) */
  retention: {
    freeToPaidRate: number // 유료 / 전체 가입
    canceledCount: number
    churnRate: number // 해지 / (유료 + 해지)
  }

  /** GMV·활동 — 임베디드 결제(핀테크) 가치의 기반 */
  gmv: {
    realizedGmv: number // 완료 예약 거래액 누적
    gmvThisMonth: number
    totalBookings: number
    completedBookings: number
    avgDealSize: number // 완료 예약 평균 객단가
    activeContracts: number
    contractMrr: number // 정기계약 월 환산 매출
  }

  /** B2B 파이프라인 — 타겟이 법인 거래처라 영업 자산이 핵심 */
  pipeline: {
    totalLeads: number
    corporateLeadRate: number // 법인(company) 비중
    openPipelineValue: number // 진행 중 리드의 월 예산 합
    statusBreakdown: { status: string; count: number }[]
  }
}

// ── 보조 함수 ────────────────────────────────────────────────────────────────

// 매출이 잡히는 구독 상태 (스냅샷 모듈에서도 재사용)
export const PAID_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due'])
const COMPLETED_BOOKING = 'completed'
const OPEN_LEAD_STATUSES = new Set(['new', 'contacted', 'quoted', 'follow_up']) // 진행 중
const WEEKS_PER_MONTH = 4.345

export function planPrice(plan: string): number {
  return (PLANS as Record<string, { price: number }>)[plan]?.price ?? 0
}

/** 구독의 현재 유효 MRR — 매출 상태가 아니면 0(이탈/베타) */
export function effectiveMrr(plan: string, status: string): number {
  return PAID_SUBSCRIPTION_STATUSES.has(status) ? planPrice(plan) : 0
}

function planLabel(plan: string): string {
  return (PLANS as Record<string, { label: string }>)[plan]?.label ?? plan
}

function startOfThisMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

// 정기계약 가격을 월 환산값으로 정규화한다.
// frequency는 JSON({type, count})이며, 주 단위는 월 4.345회로 환산한다.
// 레거시/불명 값은 contract_price를 월값으로 간주(보수적).
function monthlyContractValue(contractPrice: number, frequencyRaw: string | null): number {
  const f = frequencyRaw ? parseFrequency(frequencyRaw) : null
  if (!f) return contractPrice
  if (f.type === 'weekly') return Math.round(contractPrice * f.count * WEEKS_PER_MONTH)
  return contractPrice * f.count
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return numerator / denominator
}

// ── 메인 집계 ────────────────────────────────────────────────────────────────

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const db = createServiceClient()
  const monthStart = startOfThisMonth().toISOString()

  // 필요한 데이터만 병렬로 가져온다(전 업체 집계).
  const [
    businessesRes,
    subscriptionsRes,
    bookingsRes,
    contractsRes,
    leadsRes,
    quoteBizRes,
    customerBizRes,
  ] = await Promise.all([
    // acquisition_source는 신규 컬럼 — 타입 갱신 전까지 as never 로 조회
    db.from('businesses').select('id, created_at, acquisition_source' as never),
    db.from('subscriptions').select('business_id, plan, status'),
    db.from('bookings').select('status, final_price, created_at, deleted_at'),
    db.from('contracts').select('status, contract_price, frequency'),
    db.from('leads').select('status, customer_type, monthly_budget'),
    db.from('quotes').select('business_id'),
    db.from('customers').select('business_id'),
  ])

  const businesses = (businessesRes.data ?? []) as unknown as {
    id: string
    created_at: string
    acquisition_source: string | null
  }[]
  const subscriptions = subscriptionsRes.data ?? []
  const bookings = bookingsRes.data ?? []
  const contracts = contractsRes.data ?? []
  const leads = leadsRes.data ?? []

  // ── 성장 ──
  const totalBusinesses = businesses.length
  const newBusinessesThisMonth = businesses.filter((b) => b.created_at >= monthStart).length

  // 활성 = 견적·예약·고객 중 하나라도 보유한 업체
  const activeBizIds = new Set<string>()
  for (const q of quoteBizRes.data ?? []) if (q.business_id) activeBizIds.add(q.business_id)
  for (const c of customerBizRes.data ?? []) if (c.business_id) activeBizIds.add(c.business_id)
  // 예약은 business_id를 따로 안 가져왔으므로, 예약 보유 여부는 위 두 신호로 대체한다.
  const activeBusinesses = activeBizIds.size

  // 가입 경로별 분포 (어떤 채널에서 유입되는지 = 홍보 전략 판단 근거)
  const ACQUISITION_LABELS: Record<string, string> = {
    youtube: '유튜브',
    search: '검색(네이버·구글)',
    referral: '지인 소개',
    sns: '인스타·SNS',
    community: '블로그·카페',
    etc: '기타',
    unknown: '미기록', // 경로 추적 도입 전 가입 업체
  }
  const acqCounts = new Map<string, number>()
  for (const b of businesses) {
    const key = b.acquisition_source ?? 'unknown'
    acqCounts.set(key, (acqCounts.get(key) ?? 0) + 1)
  }
  const acquisitionBreakdown = Array.from(acqCounts.entries())
    .map(([sourceKey, count]) => ({
      source: sourceKey,
      label: ACQUISITION_LABELS[sourceKey] ?? sourceKey,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // ── 매출 ──
  const paidSubs = subscriptions.filter(
    (s) => PAID_SUBSCRIPTION_STATUSES.has(s.status) && planPrice(s.plan) > 0,
  )
  const payingBusinesses = paidSubs.length
  const mrr = paidSubs.reduce((sum, s) => sum + planPrice(s.plan), 0)

  // 플랜별 분해(유료 플랜만)
  const planBreakdown: PlanBreakdownRow[] = Object.values(PLANS)
    .filter((p) => p.price > 0)
    .map((p) => {
      const count = paidSubs.filter((s) => s.plan === p.id).length
      return { plan: p.id, label: planLabel(p.id), count, mrr: count * p.price }
    })

  // ── 리텐션 ──
  const canceledCount = subscriptions.filter(
    (s) => (s.status === 'cancelled' || s.status === 'expired') && planPrice(s.plan) > 0,
  ).length

  // ── GMV·활동 ──
  const liveBookings = bookings.filter((b) => !b.deleted_at)
  const completed = liveBookings.filter((b) => b.status === COMPLETED_BOOKING)
  const realizedGmv = completed.reduce((sum, b) => sum + (b.final_price ?? 0), 0)
  const gmvThisMonth = completed
    .filter((b) => b.created_at >= monthStart)
    .reduce((sum, b) => sum + (b.final_price ?? 0), 0)

  const activeContractRows = contracts.filter(
    (c) => c.status === 'active' || c.status === 'paused',
  )
  const contractMrr = activeContractRows.reduce(
    (sum, c) => sum + monthlyContractValue(c.contract_price ?? 0, c.frequency),
    0,
  )

  // ── B2B 파이프라인 ──
  const totalLeads = leads.length
  const corporateLeads = leads.filter((l) => (l.customer_type ?? 'company') === 'company').length
  const openPipelineValue = leads
    .filter((l) => OPEN_LEAD_STATUSES.has(l.status))
    .reduce((sum, l) => sum + (l.monthly_budget ?? 0), 0)

  const statusCounts = new Map<string, number>()
  for (const l of leads) statusCounts.set(l.status, (statusCounts.get(l.status) ?? 0) + 1)
  const statusBreakdown = [...statusCounts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)

  return {
    generatedAt: new Date().toISOString(),
    growth: {
      totalBusinesses,
      newBusinessesThisMonth,
      activeBusinesses,
      activationRate: rate(activeBusinesses, totalBusinesses),
      acquisitionBreakdown,
    },
    revenue: {
      payingBusinesses,
      mrr,
      arr: mrr * 12,
      arpa: Math.round(rate(mrr, payingBusinesses)),
      planBreakdown,
    },
    retention: {
      freeToPaidRate: rate(payingBusinesses, totalBusinesses),
      canceledCount,
      churnRate: rate(canceledCount, payingBusinesses + canceledCount),
    },
    gmv: {
      realizedGmv,
      gmvThisMonth,
      totalBookings: liveBookings.length,
      completedBookings: completed.length,
      avgDealSize: Math.round(rate(realizedGmv, completed.length)),
      activeContracts: activeContractRows.length,
      contractMrr,
    },
    pipeline: {
      totalLeads,
      corporateLeadRate: rate(corporateLeads, totalLeads),
      openPipelineValue,
      statusBreakdown,
    },
  }
}
