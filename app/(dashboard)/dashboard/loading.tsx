// 대시보드 공통 로딩 스켈레톤 — 페이지 전환 시 즉시 표시
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 상단 타이틀 + 버튼 영역 */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 bg-muted rounded-lg" />
        <div className="h-10 w-28 bg-muted rounded-lg" />
      </div>

      {/* KPI 카드 3개 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="h-4 w-20 bg-muted rounded" />
            <div className="h-7 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* 리스트/카드 영역 */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4 flex items-center gap-4">
            <div className="h-10 w-10 bg-muted rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-3 w-48 bg-muted rounded" />
            </div>
            <div className="h-6 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
