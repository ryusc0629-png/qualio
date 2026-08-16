'use client'

import { useEffect, useState } from 'react'
import { parseFrequency, serializeFrequency } from '@/lib/utils/frequency'

const DAYS = ['월', '화', '수', '목', '금', '토', '일']

interface FrequencyPickerProps {
  value: string
  onChange: (value: string) => void
  error?: string
}

export function FrequencyPicker({ value, onChange, error }: FrequencyPickerProps) {
  // 처음 받은 value를 초기값으로 그대로 사용한다(파싱 실패 시 기본값).
  // 예전엔 마운트 후 effect로 다시 채웠는데, 그러면 기본값으로 한 번 그렸다가 다시 그려
  // 화면이 살짝 깜빡였다. 초기값으로 넣으면 처음부터 올바른 값으로 한 번만 그린다.
  const initial = parseFrequency(value)
  const [type, setType] = useState<'weekly' | 'monthly'>(initial?.type ?? 'weekly')
  const [count, setCount] = useState(initial?.count ?? 1)
  const [days, setDays] = useState<string[]>(initial?.days ?? [])

  // 내부 상태가 바뀔 때마다 직렬화해서 부모에 전달
  useEffect(() => {
    if (type === 'weekly' && count > 0) {
      onChange(serializeFrequency({ type, count, days }))
    } else if (type === 'monthly' && count > 0) {
      onChange(serializeFrequency({ type, count }))
    }
  }, [type, count, days]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleTypeChange(newType: 'weekly' | 'monthly') {
    setType(newType)
    if (newType === 'monthly') {
      setDays([])
    }
    // 횟수 범위 조정
    if (newType === 'weekly' && count > 7) setCount(7)
  }

  function handleCountChange(raw: string) {
    const num = parseInt(raw, 10)
    if (isNaN(num) || num < 1) return
    const max = type === 'weekly' ? 7 : 31
    const clamped = Math.min(num, max)
    setCount(clamped)
    // 선택된 요일이 새 횟수보다 많으면 trim
    if (type === 'weekly' && days.length > clamped) {
      setDays((prev) => prev.slice(0, clamped))
    }
  }

  function toggleDay(day: string) {
    setDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day)
      }
      if (prev.length >= count) return prev // 최대 개수 제한
      // 요일 순서 유지하며 추가
      const ordered = DAYS.filter((d) => [...prev, day].includes(d))
      return ordered
    })
  }

  return (
    <div className="space-y-3">
      {/* 주/월 토글 + 횟수 */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border overflow-hidden">
          {(['weekly', 'monthly'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTypeChange(t)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                type === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {t === 'weekly' ? '주' : '월'}
            </button>
          ))}
        </div>

        <input
          type="number"
          min={1}
          max={type === 'weekly' ? 7 : 31}
          value={count}
          onChange={(e) => handleCountChange(e.target.value)}
          className="w-16 h-9 rounded-lg border border-border bg-background px-3 text-sm text-center tabular-nums"
        />
        <span className="text-sm text-muted-foreground">회</span>
      </div>

      {/* 요일 선택 (주 단위일 때만) */}
      {type === 'weekly' && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            요일 선택
            {count > 0 && (
              <span className="ml-1">
                ({days.length}/{count}개)
              </span>
            )}
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {DAYS.map((day) => {
              const selected = days.includes(day)
              const maxReached = days.length >= count && !selected
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  disabled={maxReached}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors border ${
                    selected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : maxReached
                        ? 'bg-muted text-muted-foreground border-border opacity-40 cursor-not-allowed'
                        : 'bg-background text-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
