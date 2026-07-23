'use client'

// 일별 매출/지출 미러 막대차트 — 막대에 커서를 올리거나(데스크탑) 탭하면(모바일) 그날 숫자 표시
import { useState } from 'react'
import { formatWon } from '@/lib/finance/constants'

interface DailyBarChartProps {
  days: { day: number; revenue: number; expense: number }[]
}

export function DailyBarChart({ days }: DailyBarChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const maxVal = Math.max(1, ...days.map((d) => Math.max(d.revenue, d.expense)))
  const half = 46 // 위/아래 각 절반 높이(px)
  const activeDay = active !== null ? days[active] : null

  return (
    <div>
      {/* 범례 + 선택한 날 숫자 표시 */}
      <div className="flex items-center justify-between gap-2 mb-2 min-h-[22px]">
        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className="flex items-center gap-1 text-emerald-600"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />매출</span>
          <span className="flex items-center gap-1 text-rose-500"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" />지출</span>
        </div>
        {activeDay ? (
          <div className="flex items-center gap-2 text-xs tabular-nums min-w-0">
            <span className="font-bold shrink-0">{activeDay.day}일</span>
            <span className="text-emerald-600 truncate">매출 {formatWon(activeDay.revenue)}</span>
            <span className="text-rose-500 truncate">지출 {formatWon(activeDay.expense)}</span>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground truncate">막대에 손대면 그날 숫자가 보여요</span>
        )}
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex items-stretch gap-[3px] min-w-full" style={{ minWidth: `${days.length * 9}px` }}>
          {days.map((d, i) => {
            const revH = d.revenue > 0 ? Math.max(2, (d.revenue / maxVal) * half) : 0
            const expH = d.expense > 0 ? Math.max(2, (d.expense / maxVal) * half) : 0
            const isActive = active === i
            const dimmed = active !== null && !isActive
            return (
              <button
                key={d.day}
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
                onFocus={() => setActive(i)}
                onClick={() => setActive((cur) => (cur === i ? null : i))}
                title={`${d.day}일 · 매출 ${formatWon(d.revenue)} · 지출 ${formatWon(d.expense)}`}
                aria-label={`${d.day}일 매출 ${formatWon(d.revenue)}, 지출 ${formatWon(d.expense)}`}
                className={`flex-1 flex flex-col items-center bg-transparent appearance-none p-0 cursor-pointer rounded-sm transition-opacity ${
                  dimmed ? 'opacity-40' : 'opacity-100'
                } ${isActive ? 'bg-muted/60' : ''}`}
                style={{ minWidth: '6px' }}
              >
                {/* 위: 매출 */}
                <div className="w-full flex flex-col justify-end items-center" style={{ height: `${half}px` }}>
                  <div className="w-full rounded-t-[2px] bg-emerald-500" style={{ height: `${revH}px` }} />
                </div>
                {/* 기준선 */}
                <div className={`w-full h-px ${isActive ? 'bg-foreground/60' : 'bg-border'}`} />
                {/* 아래: 지출 */}
                <div className="w-full flex flex-col justify-start items-center" style={{ height: `${half}px` }}>
                  <div className="w-full rounded-b-[2px] bg-rose-400" style={{ height: `${expH}px` }} />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-0.5">
        <span>1일</span>
        <span>{Math.ceil(days.length / 2)}일</span>
        <span>{days.length}일</span>
      </div>
    </div>
  )
}
