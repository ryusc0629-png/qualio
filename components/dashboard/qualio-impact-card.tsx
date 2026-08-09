import { createServiceClient } from '@/lib/supabase/server'
import { getQualioImpact } from '@/lib/attribution/qualio-impact'
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

// ROI 성과판 — "퀄리오가 만든 매출"을 대시보드 첫 화면에 정면으로 세운다.
// 퀄리오로 이룬 매출은 모두 퀄리오의 성과(견적서·시방서의 전문성으로 계약이 성사되므로).
export async function QualioImpactCard({ businessId }: { businessId: string }) {
  const db = createServiceClient()
  const { startIso, endIso, label } = kstMonthRange()
  const impact = await getQualioImpact(db, businessId, startIso, endIso)

  // 완료 매출도 없고 예정도 없으면 카드 숨김(빈 성과판은 오히려 역효과)
  if (impact.completedRevenue === 0 && impact.upcomingCount === 0) return null

  const won = (n: number) => n.toLocaleString('ko-KR')

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-emerald-50 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="font-bold text-primary">{label} 퀄리오가 만든 매출</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-bold">{impact.completedCount}건</p>
          <p className="text-xs text-muted-foreground mt-0.5">완료한 예약</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-primary">
            {won(impact.completedRevenue)}
            <span className="text-sm font-semibold">원</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">만든 매출</p>
        </div>
        <div>
          {impact.upcomingRevenue > 0 ? (
            <>
              <p className="text-2xl font-bold">
                {won(impact.upcomingRevenue)}
                <span className="text-sm font-semibold">원</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">예정 매출</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold">{impact.upcomingCount}건</p>
              <p className="text-xs text-muted-foreground mt-0.5">진행 중</p>
            </>
          )}
        </div>
      </div>

      {impact.upcomingRevenue > 0 && impact.upcomingCount > 0 && (
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          진행 중인 예약 {impact.upcomingCount}건이 곧 매출로 이어져요
        </p>
      )}
    </div>
  )
}
