'use client'

import { SOURCE_LABELS } from '@/lib/utils/detect-view-source'
import type { ViewSource } from '@/lib/utils/detect-view-source'

interface MonthlyCount {
  month: string
  count: number
}

interface TopPost {
  title: string
  count: number
}

interface StatsChartsProps {
  sourceCounts: Record<string, number>
  monthlyData: MonthlyCount[]
  topPosts: TopPost[]
  totalViews: number
}

export function StatsCharts({ sourceCounts, monthlyData, topPosts, totalViews }: StatsChartsProps) {
  // 소스별 집계를 내림차순 정렬
  const sortedSources = (Object.entries(sourceCounts) as [ViewSource, number][])
    .sort((a, b) => b[1] - a[1])

  const maxMonthly = Math.max(...monthlyData.map((d) => d.count), 1)

  return (
    <div className="space-y-5">
      {/* 유입 소스 분포 */}
      {sortedSources.length > 0 && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-slate-50">
            <p className="font-semibold text-sm">유입 소스</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {sortedSources.map(([source, count]) => {
              const pct = totalViews > 0 ? Math.round((count / totalViews) * 100) : 0
              const isAi = source.startsWith('ai_')
              return (
                <div key={source} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={`font-medium ${isAi ? 'text-emerald-700' : 'text-foreground'}`}>
                      {isAi && '✦ '}{SOURCE_LABELS[source as ViewSource] ?? source}
                    </span>
                    <span className="text-muted-foreground">{count.toLocaleString()}회 ({pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isAi ? 'bg-emerald-500' : 'bg-primary'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-5 pb-3 pt-1 space-y-0.5">
            {sortedSources.some(([s]) => s.startsWith('ai_')) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="text-emerald-600 font-semibold">✦</span> AI 검색 유입
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              * 직접 방문에는 ChatGPT 앱 등 앱에서 클릭한 AI 유입도 포함될 수 있어요
            </p>
          </div>
        </div>
      )}

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

      {/* 데이터 없을 때 안내 */}
      {totalViews === 0 && (
        <div className="rounded-xl border bg-white px-5 py-8 text-center space-y-2">
          <p className="text-sm font-medium">아직 조회 데이터가 없어요</p>
          <p className="text-xs text-muted-foreground">
            GEO 포스트가 AI 검색엔진에 인덱싱되면 자동으로 집계됩니다
          </p>
        </div>
      )}
    </div>
  )
}
