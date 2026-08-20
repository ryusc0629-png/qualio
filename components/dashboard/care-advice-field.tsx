'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { BellRing, Plus, X } from 'lucide-react'

// 보고서에 '앞으로 손봐야 할 것'과 그 시점, 그리고 '다음에 제안할 서비스'를 적는 칸.
//
// 왜 이 칸을 두나:
// 예전엔 작업 보고서에 '추천 서비스 + 가격 + 견적 문의' 배너를 붙였다. 거래처에 보내는
// 서류에 판촉이 박혀 있으면 문서의 격이 떨어지고 영업으로만 읽힌다.
// 대신 "이 부분이 이랬고, 몇 달 뒤엔 이렇게 될 수 있다"를 남긴다.
//
// 제안할 서비스는 고객 문서에 싣지 않는다. 현장이 고르면 대기열에 쌓이고,
// 대표가 확인해 승인한 것만 정해진 시점에 연락이 나간다.
// 현장 작업자가 현장 상태를 가장 잘 알기 때문에 고르는 사람은 현장이다.

/** 몇 달 뒤에 연락할지 — 현장에서 고르기 쉬운 폭만 남긴다 */
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
  /** 업체에 등록된 서비스 — 고르기 쉽게 칩으로 보여준다 */
  serviceItems?: { name: string; basePrice: number }[]
  /** 다음에 제안할 서비스 이름들 (등록된 것 + 현장에서 직접 적은 것) */
  suggestions?: string[]
  onSuggestionsChange?: (v: string[]) => void
}

export function CareAdviceField({
  advice,
  months,
  onAdviceChange,
  onMonthsChange,
  serviceItems = [],
  suggestions,
  onSuggestionsChange,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')

  // 제안 기능을 안 쓰는 화면에서는 이 블록 자체를 숨긴다
  const canSuggest = !!onSuggestionsChange
  const picked = suggestions ?? []

  const toggle = (name: string) => {
    if (!onSuggestionsChange) return
    onSuggestionsChange(
      picked.includes(name) ? picked.filter((s) => s !== name) : [...picked, name]
    )
  }

  const addCustom = () => {
    const name = customName.trim()
    if (!onSuggestionsChange || !name) return
    if (!picked.includes(name)) onSuggestionsChange([...picked, name])
    setCustomName('')
    setCustomOpen(false)
  }

  // 등록 목록에 없는 이름 — 대표 화면에서 '서비스로 등록할까요?'를 띄우는 근거가 된다
  const registered = new Set(serviceItems.map((s) => s.name))
  const hasUnregistered = picked.some((s) => !registered.has(s))

  const showTiming = !!advice.trim() || picked.length > 0

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

      {canSuggest && (
        <div className="space-y-2 pt-1">
          <div>
            <Label className="text-sm font-medium">다음에 제안할 서비스 (선택)</Label>
            <p className="text-xs text-muted-foreground">
              이 현장에 다음에 필요해 보이는 걸 골라주세요. 목록에 없으면 직접 적어도 돼요
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {serviceItems.map((svc) => {
              const on = picked.includes(svc.name)
              return (
                <button
                  key={svc.name}
                  type="button"
                  onClick={() => toggle(svc.name)}
                  aria-pressed={on}
                  className={`h-10 px-3 rounded-full border text-sm transition-colors ${
                    on ? 'border-primary bg-primary/5 text-primary font-medium' : 'hover:border-primary/40'
                  }`}
                >
                  {svc.name}
                </button>
              )
            })}

            {/* 직접 적은 것 — 등록 서비스 칩과 구분해서 보여준다 */}
            {picked
              .filter((s) => !registered.has(s))
              .map((name) => (
                <span
                  key={name}
                  className="h-10 px-3 rounded-full border border-primary bg-primary/5 text-primary text-sm font-medium inline-flex items-center gap-1.5"
                >
                  {name}
                  <button type="button" onClick={() => toggle(name)} aria-label={`${name} 빼기`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}

            {!customOpen ? (
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                className="h-10 px-3 rounded-full border border-dashed text-sm text-muted-foreground inline-flex items-center gap-1 hover:border-primary/40"
              >
                <Plus className="h-3.5 w-3.5" />
                직접 적기
              </button>
            ) : (
              <div className="flex items-center gap-1.5 w-full">
                <input
                  autoFocus
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addCustom() }
                    if (e.key === 'Escape') setCustomOpen(false)
                  }}
                  placeholder="예: 방충망 교체"
                  className="flex-1 h-10 rounded-lg border px-3 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addCustom}
                  className="h-10 px-3 rounded-lg border border-primary text-primary text-sm font-medium shrink-0"
                >
                  넣기
                </button>
              </div>
            )}
          </div>

          {hasUnregistered && (
            <p className="text-[11px] text-muted-foreground">
              직접 적은 건 사장님 화면에서 서비스로 등록할지 물어봐요
            </p>
          )}
        </div>
      )}

      {showTiming && (
        <div className="space-y-1.5 pt-1">
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
            <p className="text-[11px] text-muted-foreground inline-flex items-start gap-1">
              <BellRing className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                고객에게 지금 가지 않아요. {months}개월 뒤에 사장님이 확인하고 연락드려요
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
