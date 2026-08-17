'use client'

import { Label } from '@/components/ui/label'
import { CalendarOff } from 'lucide-react'
import { KR_HOLIDAYS } from '@/lib/holidays/kr'

// 계약마다 "공휴일엔 갈까 말까"를 정하는 칸.
// 계약 수정 창이 두 곳(고객·계약 수정 / 정기계약 수정)이라 같은 칸을 여기 한 번만 만든다.

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 사장님이 "그래서 언제가 공휴일인데?"를 바로 알 수 있게 앞으로 3개만 보여준다
function nextHolidayLabels(from: string, limit = 3): string[] {
  return Object.entries(KR_HOLIDAYS)
    .filter(([date]) => date >= from)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, limit)
    .map(([date, name]) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${name}`)
}

interface HolidayPolicyFieldProps {
  value: boolean // true = 공휴일엔 쉬어요
  onChange: (skipHolidays: boolean) => void
}

export function HolidayPolicyField({ value, onChange }: HolidayPolicyFieldProps) {
  const upcoming = nextHolidayLabels(todayKst())

  return (
    <div className="space-y-1">
      <Label>공휴일엔 어떻게 하나요? (필수)</Label>
      <div className="grid grid-cols-2 gap-2">
        {[
          { option: true, title: '쉬어요', desc: '공휴일은 일정에 안 잡혀요' },
          { option: false, title: '그날도 가요', desc: '공휴일에도 평소처럼 잡혀요' },
        ].map((o) => {
          const on = value === o.option
          return (
            <button
              key={String(o.option)}
              type="button"
              onClick={() => onChange(o.option)}
              aria-pressed={on}
              className={`rounded-lg border p-3 text-left transition-colors ${
                on ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
              }`}
            >
              <p className="text-sm font-semibold">{o.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</p>
            </button>
          )
        })}
      </div>
      {upcoming.length > 0 && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <CalendarOff className="h-3 w-3 shrink-0" />
          다가오는 공휴일: {upcoming.join(', ')}
        </p>
      )}
    </div>
  )
}
