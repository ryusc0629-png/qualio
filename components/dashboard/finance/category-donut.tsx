'use client'

// 지출 분류 도넛 — 조각(또는 범례)에 커서를 올리거나 탭하면 그 분류의 금액·비율 표시
import { useState } from 'react'
import { CATEGORY_COLORS, formatWon, formatManwon } from '@/lib/finance/constants'

interface CategoryDonutProps {
  items: { label: string; amount: number }[] // 금액 내림차순
  total: number
}

export function CategoryDonut({ items, total }: CategoryDonutProps) {
  const [active, setActive] = useState<number | null>(null)

  // 각 조각의 시작 위치(%)와 길이(%) 계산 — pathLength=100 기준
  let acc = 0
  const segments = items.map((it, i) => {
    const pct = total > 0 ? (it.amount / total) * 100 : 0
    const start = acc
    acc += pct
    return { ...it, i, pct, start, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }
  })

  const activeItem = active !== null ? segments[active] : null

  return (
    <div className="flex items-center gap-5">
      {/* 도넛 */}
      <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
        <svg viewBox="0 0 120 120" className="w-[120px] h-[120px]">
          <g transform="rotate(-90 60 60)">
            {segments.map((s) => {
              const isActive = active === s.i
              const dimmed = active !== null && !isActive
              return (
                <circle
                  key={s.label}
                  cx={60}
                  cy={60}
                  r={48}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={isActive ? 22 : 18}
                  pathLength={100}
                  strokeDasharray={`${s.pct} ${100 - s.pct}`}
                  strokeDashoffset={-s.start}
                  opacity={dimmed ? 0.35 : 1}
                  style={{ cursor: 'pointer', transition: 'opacity .15s, stroke-width .15s' }}
                  onMouseEnter={() => setActive(s.i)}
                  onMouseLeave={() => setActive((cur) => (cur === s.i ? null : cur))}
                  onClick={() => setActive((cur) => (cur === s.i ? null : s.i))}
                >
                  <title>{`${s.label} ${formatWon(s.amount)} (${Math.round(s.pct)}%)`}</title>
                </circle>
              )
            })}
          </g>
        </svg>
        {/* 가운데 라벨 — 조각 선택 시 해당 분류, 아니면 총 지출 */}
        <div
          className="absolute inset-0 m-auto rounded-full bg-white flex flex-col items-center justify-center text-center px-1"
          style={{ width: 76, height: 76, pointerEvents: 'none' }}
        >
          {activeItem ? (
            <>
              <span className="text-[10px] text-muted-foreground truncate max-w-[70px]">{activeItem.label}</span>
              <span className="text-[13px] font-bold tabular-nums leading-tight">{formatWon(activeItem.amount)}</span>
              <span className="text-[10px] font-medium" style={{ color: activeItem.color }}>{Math.round(activeItem.pct)}%</span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-muted-foreground">총 지출</span>
              <span className="text-sm font-bold tabular-nums">{formatManwon(total)}</span>
            </>
          )}
        </div>
      </div>

      {/* 범례 — 여기에 손대도 조각이 강조됨 */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {segments.map((s) => {
          const isActive = active === s.i
          return (
            <button
              key={s.label}
              type="button"
              onMouseEnter={() => setActive(s.i)}
              onMouseLeave={() => setActive((cur) => (cur === s.i ? null : cur))}
              onClick={() => setActive((cur) => (cur === s.i ? null : s.i))}
              className={`w-full flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 transition-colors ${
                isActive ? 'bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="truncate flex-1 min-w-0 text-left">{s.label}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">{Math.round(s.pct)}%</span>
              <span className="font-medium tabular-nums shrink-0 w-20 text-right">{formatWon(s.amount)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
