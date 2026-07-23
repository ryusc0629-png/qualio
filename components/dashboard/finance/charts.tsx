// 재무 대시보드 차트 — 순수 SVG/CSS(서버 컴포넌트). 외부 차트 라이브러리 없이 구현.
import { formatWon, formatManwon } from '@/lib/finance/constants'

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

