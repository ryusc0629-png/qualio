'use client'

import { Label } from '@/components/ui/label'
import { BellRing } from 'lucide-react'

// 보고서에 '앞으로 손봐야 할 것'과 그 시점을 적는 칸.
//
// 왜 이 칸을 두나:
// 예전엔 작업 보고서에 '추천 서비스 + 가격 + 견적 문의' 배너를 붙였다. 거래처에 보내는
// 서류에 판촉이 박혀 있으면 문서의 격이 떨어지고 영업으로만 읽힌다.
// 대신 "이 부분이 이랬고, 몇 달 뒤엔 이렇게 될 수 있다"를 남긴다.
// 그 시점이 되면 사장님에게 알림이 가서 먼저 연락하게 된다 —
// 같은 재방문 유도라도 근거가 그 현장 기록이라 설득력이 다르다.

/** 몇 달 뒤에 알릴지 — 현장에서 고르기 쉬운 폭만 남긴다 */
const PERIODS = [
  { months: 0, label: '안 함' },
  { months: 3, label: '3개월' },
  { months: 6, label: '6개월' },
  { months: 12, label: '1년' },
] as const

interface Props {
  advice: string
  months: number
  onAdviceChange: (v: string) => void
  onMonthsChange: (v: number) => void
}

export function CareAdviceField({ advice, months, onAdviceChange, onMonthsChange }: Props) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-medium">앞으로 손봐야 할 것</Label>
        <p className="text-xs text-muted-foreground">
          지금은 괜찮지만 나중에 문제가 될 부분을 적어주세요. 고객 보고서에 그대로 실려요
        </p>
      </div>

      <textarea
        value={advice}
        onChange={(e) => onAdviceChange(e.target.value)}
        rows={3}
        placeholder="예: 후드 기름때는 제거했지만 필터가 오래돼 교체가 필요해 보입니다."
        className="w-full rounded-xl border p-3 text-sm outline-none focus:border-primary resize-none"
      />

      {advice.trim() && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">언제쯤 다시 연락드릴까요?</p>
          <div className="grid grid-cols-4 gap-2">
            {PERIODS.map((p) => {
              const on = months === p.months
              return (
                <button
                  key={p.months}
                  type="button"
                  onClick={() => onMonthsChange(p.months)}
                  aria-pressed={on}
                  className={`h-11 rounded-lg border text-sm font-medium transition-colors ${
                    on ? 'border-primary bg-primary/5 text-primary' : 'hover:border-primary/40'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          {months > 0 && (
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <BellRing className="h-3 w-3 shrink-0" />
              {months}개월 뒤에 사장님께 알림이 가요. 그때 먼저 연락드리면 됩니다
            </p>
          )}
        </div>
      )}
    </div>
  )
}
