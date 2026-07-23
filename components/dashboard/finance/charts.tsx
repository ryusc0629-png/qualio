// 재무 대시보드 차트 — 순수 SVG/CSS(서버 컴포넌트). 외부 차트 라이브러리 없이 구현.
import { CATEGORY_COLORS, formatWon, formatManwon } from '@/lib/finance/constants'

// ── 손익분기점 반원 게이지 ──────────────────────────────────
interface BreakEvenGaugeProps {
  achievementPct: number      // 달성률(%)
  breakEvenRevenue: number    // 본전 매출
  revenue: number             // 이번 달 매출
  remaining: number           // 본전까지 남은 금액(0이면 달성)
  hasFixed: boolean           // 고정비가 설정돼 있는지
}

export function BreakEvenGauge({ achievementPct, breakEvenRevenue, revenue, remaining, hasFixed }: BreakEvenGaugeProps) {
  const frac = Math.max(0, Math.min(1, achievementPct / 100))
  // 반원 둘레 = π * r
  const r = 90
  const circumference = Math.PI * r
  const dash = frac * circumference

  // 상태별 색상 — 달성(초록) / 근접(호박) / 부족(회색빛 초록)
  const reached = achievementPct >= 100
  const color = reached ? '#059669' : achievementPct >= 70 ? '#d97706' : '#0ea5a3'

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[240px]">
        <svg viewBox="0 0 200 110" className="w-full">
          {/* 배경 트랙 */}
          <path
            d="M 10 100 A 90 90 0 0 1 190 100"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="16"
            strokeLinecap="round"
          />
          {/* 채워진 값 */}
          <path
            d="M 10 100 A 90 90 0 0 1 190 100"
            fill="none"
            stroke={color}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        {/* 중앙 수치 */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-3xl font-extrabold tabular-nums" style={{ color }}>
            {hasFixed ? `${Math.round(achievementPct)}%` : '—'}
          </span>
          <span className="text-xs text-muted-foreground">본전 달성률</span>
        </div>
      </div>

      {/* 설명 문구 */}
      <div className="mt-3 text-center">
        {!hasFixed ? (
          <p className="text-sm text-muted-foreground">고정비를 설정하면 본전 지점을 계산해드려요</p>
        ) : reached ? (
          <p className="text-sm font-semibold text-emerald-700">
            본전을 넘었어요! 🎉 지금부터는 순이익이에요
          </p>
        ) : (
          <p className="text-sm">
            본전까지 <span className="font-bold text-foreground">{formatWon(remaining)}</span> 남았어요
          </p>
        )}
        {hasFixed && (
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            이번 달 {formatManwon(revenue)}원 / 본전 {formatManwon(breakEvenRevenue)}원
          </p>
        )}
      </div>
    </div>
  )
}

// ── 지출 분류별 도넛 ────────────────────────────────────────
interface CategoryDonutProps {
  items: { label: string; amount: number }[] // 금액 내림차순
  total: number
}

export function CategoryDonut({ items, total }: CategoryDonutProps) {
  // conic-gradient 문자열 만들기(누적 %)
  let acc = 0
  const stops: string[] = []
  items.forEach((it, i) => {
    const start = (acc / total) * 100
    acc += it.amount
    const end = (acc / total) * 100
    const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length]
    stops.push(`${color} ${start}% ${end}%`)
  })
  const gradient = `conic-gradient(${stops.join(', ')})`

  return (
    <div className="flex items-center gap-5">
      {/* 도넛 */}
      <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
        <div className="w-[120px] h-[120px] rounded-full" style={{ background: gradient }} />
        <div className="absolute inset-0 m-auto rounded-full bg-white flex flex-col items-center justify-center" style={{ width: 74, height: 74 }}>
          <span className="text-[10px] text-muted-foreground">총 지출</span>
          <span className="text-sm font-bold tabular-nums">{formatManwon(total)}</span>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {items.map((it, i) => {
          const pct = Math.round((it.amount / total) * 100)
          return (
            <div key={it.label} className="flex items-center gap-2 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
              />
              <span className="truncate flex-1 min-w-0">{it.label}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">{pct}%</span>
              <span className="font-medium tabular-nums shrink-0 w-20 text-right">{formatWon(it.amount)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
