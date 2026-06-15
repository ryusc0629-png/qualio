'use client'

import { useState } from 'react'

interface DayData {
  date: string
  revenue: number
  dayLabel: string
  isToday: boolean
}

interface WeeklyChartProps {
  data: DayData[]
  maxRevenue: number
  total: number
}

export function WeeklyChart({ data, maxRevenue, total }: WeeklyChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">최근 7일 매출</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            합계 {total > 0 ? `${total.toLocaleString('ko-KR')}원` : '—'}
          </p>
        </div>
      </div>

      {/* 바 차트 */}
      <div className="flex items-end gap-1.5 h-20 mb-1">
        {data.map((day, i) => {
          const barH = day.revenue > 0
            ? Math.max(Math.round((day.revenue / maxRevenue) * 72), 4)
            : 2
          const isHovered = hoveredIdx === i

          return (
            <div
              key={day.date}
              className="flex-1 h-full flex flex-col items-center justify-end relative cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* 툴팁 */}
              {isHovered && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none flex flex-col items-center">
                  <div
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg border"
                    style={{ backgroundColor: '#ffffff', color: '#111827', borderColor: '#e5e7eb' }}
                  >
                    {day.revenue > 0
                      ? `${day.revenue.toLocaleString('ko-KR')}원`
                      : '매출 없음'}
                  </div>
                  {/* 화살표 */}
                  <div
                    className="w-0 h-0"
                    style={{
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: '5px solid #e5e7eb',
                    }}
                  />
                </div>
              )}

              {/* 바 */}
              <div
                className={`w-full rounded-t transition-all duration-100 ${
                  isHovered
                    ? 'bg-primary opacity-100'
                    : day.isToday
                      ? 'bg-primary'
                      : day.revenue > 0
                        ? 'bg-primary/40'
                        : 'bg-border'
                }`}
                style={{ height: `${barH}px` }}
              />
            </div>
          )
        })}
      </div>

      {/* 요일 레이블 */}
      <div className="flex gap-1.5">
        {data.map((day) => (
          <div key={day.date} className="flex-1 text-center">
            <span className={`text-[10px] ${day.isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
              {day.dayLabel}
            </span>
          </div>
        ))}
      </div>

      {total === 0 && (
        <p className="text-xs text-muted-foreground/60 text-center mt-2">이번 주 완료된 예약이 없어요</p>
      )}
    </div>
  )
}
