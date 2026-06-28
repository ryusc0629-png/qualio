import { TrendingUp, Trophy } from 'lucide-react'

// 영업 단계별 현황 리포트 — 거래처(법인) 영업의 '숨은 파이프라인'을 한눈에 보여준다.
// 어느 단계에 거래처가 몇 곳 있고, 그게 다 계약되면 월매출이 얼마인지(잠재 매출),
// 그리고 결론 난 건들 중 계약 성사 비율(승률)을 보여줘 어디에 집중할지 알려준다.
// 새 테이블 없이 기존 leads.status·monthly_budget만 사용한다.

interface Lead {
  status: string
  customer_type: string
  monthly_budget: number | null
}

// 진행 중(in-flight) 단계 — 계약/포기/보관은 제외
const ACTIVE_STAGES = [
  { key: 'new',         label: '새 문의',   bar: 'bg-gray-400' },
  { key: 'contacted',   label: '연락함',    bar: 'bg-blue-400' },
  { key: 'follow_up',   label: '현장 방문', bar: 'bg-indigo-400' },
  { key: 'quoted',      label: '견적 보냄', bar: 'bg-amber-400' },
  { key: 'negotiating', label: '금액 협의', bar: 'bg-orange-500' },
] as const

// 원 → "N만원" (만원 단위 반올림)
function toManwon(won: number): string {
  return `${Math.round(won / 10000).toLocaleString()}만원`
}

export function PipelineStageReport({ leads }: { leads: Lead[] }) {
  // 법인 거래처만 대상 (일반 고객은 견적·예약 기반 자동 상태라 영업 단계 개념이 다름)
  const company = leads.filter((l) => l.customer_type === 'company')
  if (company.length === 0) return null

  const stages = ACTIVE_STAGES.map((s) => {
    const inStage = company.filter((l) => l.status === s.key)
    return {
      ...s,
      count: inStage.length,
      budget: inStage.reduce((sum, l) => sum + (l.monthly_budget ?? 0), 0),
    }
  })
  const activeCount = stages.reduce((s, x) => s + x.count, 0)
  const potentialRevenue = stages.reduce((s, x) => s + x.budget, 0)
  const maxCount = stages.reduce((m, x) => Math.max(m, x.count), 0)

  // 승률 — 결론 난 건(계약+포기) 중 계약 비율
  const contracted = company.filter((l) => l.status === 'contracted').length
  const rejected = company.filter((l) => l.status === 'rejected').length
  const decided = contracted + rejected
  const winRate = decided > 0 ? Math.round((contracted / decided) * 100) : null

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="px-5 py-3 border-b bg-slate-50">
        <p className="font-semibold text-sm">영업 단계별 현황</p>
      </div>

      {/* 핵심 지표 — 잠재 월매출 + 승률 */}
      <div className="grid grid-cols-2 divide-x">
        <div className="px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-1 text-emerald-600">
            <TrendingUp className="h-4 w-4" />
            <p className="text-xl font-bold">{potentialRevenue > 0 ? toManwon(potentialRevenue) : '—'}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">영업 중 잠재 월매출</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">지금 거래처가 다 계약되면</p>
        </div>
        <div className="px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-1 text-primary">
            <Trophy className="h-4 w-4" />
            <p className="text-xl font-bold">{winRate !== null ? `${winRate}%` : '—'}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">계약 성사율</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            {decided > 0 ? `계약 ${contracted} · 포기 ${rejected}` : '아직 결론 난 거래처 없음'}
          </p>
        </div>
      </div>

      {/* 단계별 막대 — 어느 단계에 거래처가 몰려 있는지 */}
      {activeCount > 0 ? (
        <div className="border-t px-4 py-4 space-y-2">
          {stages.map((s) => {
            const widthPct = maxCount > 0 ? Math.max((s.count / maxCount) * 100, s.count > 0 ? 10 : 0) : 0
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">{s.label}</span>
                <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
                  <div className={`h-full ${s.bar} rounded-md transition-all`} style={{ width: `${widthPct}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums w-7 text-right shrink-0">{s.count}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums w-16 text-right shrink-0">
                  {s.budget > 0 ? toManwon(s.budget) : ''}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="border-t px-5 py-4 text-center">
          <p className="text-xs text-muted-foreground">지금 영업 중인 거래처가 없어요. 거래처를 추가해 영업을 시작하세요</p>
        </div>
      )}
    </div>
  )
}
