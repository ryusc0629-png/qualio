import { createServiceClient } from '@/lib/supabase/server'
import { getQualioImpact } from '@/lib/attribution/qualio-impact'
import { getPlanPrice, PLANS, type PlanId } from '@/lib/config/plans'
import { Sparkles, TrendingUp } from 'lucide-react'

// 이번 달(KST) 범위
function kstMonthRange(): { startIso: string; endIso: string; label: string } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth() // 0-based
  const startIso = new Date(Date.UTC(y, m, 1)).toISOString()
  const endIso = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)).toISOString()
  return { startIso, endIso, label: `${m + 1}월` }
}

const VALID_PLAN_IDS: PlanId[] = ['beta', 'starter', 'pro', 'scale']

// ROI 성과판 — "청소맨은 만원인데 기록만 하고, 퀄리오는 돈을 벌어다 준다"를 정면에 세운다.
// 숫자는 100% 실데이터(견적 페이지를 거쳐 들어온 예약만). 지어내지 않는다.
export async function QualioImpactCard({ businessId }: { businessId: string }) {
  const db = createServiceClient()
  const { startIso, endIso, label } = kstMonthRange()
  const impact = await getQualioImpact(db, businessId, startIso, endIso)

  // 완료 매출도 없고 예정도 없으면 카드 숨김(빈 성과판은 오히려 역효과)
  if (impact.completedRevenue === 0 && impact.upcomingCount === 0) return null

  // 요금 조회 — 구독 플랜. 베타(무료)면 정식 요금(성장) 기준으로 배수 환산.
  const { data: subRows } = (await db
    .from('subscriptions')
    .select('plan' as never)
    .eq('business_id', businessId)
    .limit(1)) as unknown as { data: { plan: string | null }[] | null }
  const planRaw = subRows?.[0]?.plan ?? null
  const planId: PlanId = VALID_PLAN_IDS.includes(planRaw as PlanId) ? (planRaw as PlanId) : 'beta'
  const paidPrice = getPlanPrice(planId)
  const isFree = paidPrice === 0
  const refPrice = isFree ? PLANS.pro.price : paidPrice // 무료면 '성장(29만원)' 기준
  const multiple =
    refPrice > 0 && impact.completedRevenue > 0 ? Math.floor(impact.completedRevenue / refPrice) : 0

  const won = (n: number) => n.toLocaleString('ko-KR')

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-emerald-50 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="font-bold text-primary">{label} 퀄리오 성과</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-bold">{impact.completedCount}건</p>
          <p className="text-xs text-muted-foreground mt-0.5">데려온 예약</p>
        </div>
        <div>
          <p className="text-2xl font-bold">
            {won(impact.completedRevenue)}
            <span className="text-sm font-semibold">원</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">만든 매출</p>
        </div>
        <div>
          {multiple > 0 ? (
            <>
              <p className="text-2xl font-bold text-primary">{multiple}배</p>
              <p className="text-xs text-muted-foreground mt-0.5">{isFree ? '정식 요금 대비' : '요금 대비'}</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-muted-foreground">—</p>
              <p className="text-xs text-muted-foreground mt-0.5">집계 중</p>
            </>
          )}
        </div>
      </div>

      {impact.upcomingCount > 0 && (
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          퀄리오로 들어온 예약 {impact.upcomingCount}건이 아직 진행 중이에요
        </p>
      )}

      <p className="text-[11px] text-muted-foreground/80 mt-2">
        견적 페이지를 거쳐 들어온 예약만 집계해요 (전화로 직접 받은 예약은 제외)
      </p>
    </div>
  )
}
