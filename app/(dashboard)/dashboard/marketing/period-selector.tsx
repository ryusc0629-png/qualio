import Link from 'next/link'

interface Props {
  // 현재 선택된 집계 기간(개월)
  current: number
}

const OPTIONS = [
  { months: 1, label: '최근 1개월' },
  { months: 3, label: '최근 3개월' },
  { months: 6, label: '최근 6개월' },
]

// 마케팅 성과 집계 기간 선택 — ?period= 값으로 서버 컴포넌트를 다시 집계시킨다.
// Link 소프트 내비게이션이라 페이지 전체 새로고침 없이 통계만 갱신되고, scroll={false}로 위치도 유지.
export function MarketingPeriodSelector({ current }: Props) {
  return (
    <div className="inline-flex rounded-lg border bg-white p-0.5 shrink-0">
      {OPTIONS.map((o) => {
        const active = o.months === current
        return (
          <Link
            key={o.months}
            href={`/dashboard/marketing?period=${o.months}`}
            replace
            scroll={false}
            className={[
              'px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {o.label}
          </Link>
        )
      })}
    </div>
  )
}
