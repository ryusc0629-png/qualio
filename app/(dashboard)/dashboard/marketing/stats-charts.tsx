'use client'

interface MonthlyCount {
  month: string
  count: number
}

interface TopPost {
  title: string
  count: number
}

interface StatsChartsProps {
  monthlyData: MonthlyCount[]
  topPosts: TopPost[]
}

// 유입 소스 분포는 위 '검색·AI 유입' 카드와 중복이라 제거함 — 여기선 콘텐츠 성과만(조회 TOP·발행 추이)
export function StatsCharts({ monthlyData, topPosts }: StatsChartsProps) {
  const maxMonthly = Math.max(...monthlyData.map((d) => d.count), 1)

  return (
    <div className="space-y-5">
      {/* 포스트별 조회수 TOP 5 */}
      {topPosts.length > 0 && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-slate-50">
            <p className="font-semibold text-sm">포스트별 조회수 TOP 5</p>
          </div>
          <div className="divide-y">
            {topPosts.map((post, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                <p className="flex-1 text-sm truncate">{post.title}</p>
                <span className="text-sm font-semibold shrink-0">{post.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 월별 발행 추이 바 차트 */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-slate-50">
          <p className="font-semibold text-sm">월별 발행 추이</p>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-end gap-2 h-28">
            {monthlyData.map((d) => {
              const heightPct = maxMonthly > 0 ? (d.count / maxMonthly) * 100 : 0
              const isThisMonth = d === monthlyData[monthlyData.length - 1]
              return (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold text-foreground">
                    {d.count > 0 ? d.count : ''}
                  </span>
                  <div className="w-full flex items-end" style={{ height: '80px' }}>
                    <div
                      className={`w-full rounded-t-md transition-all duration-700 ${isThisMonth ? 'bg-primary' : 'bg-slate-200'}`}
                      style={{ height: `${Math.max(heightPct, d.count > 0 ? 5 : 0)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{d.month}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
