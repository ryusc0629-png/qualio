'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => i + 6) // 6 ~ 22
const MINUTE_OPTIONS = ['00', '30']

interface DateTimePickerProps {
  date: string   // "YYYY-MM-DD"
  time: string   // "HH:mm"
  onDateChange: (date: string) => void
  onTimeChange: (time: string) => void
}

export function DateTimePicker({ date, time, onDateChange, onTimeChange }: DateTimePickerProps) {
  const today = new Date()
  const selectedDate = date ? new Date(date + 'T00:00:00') : null

  // 현재 캘린더에 표시할 연/월
  const [viewYear,  setViewYear]  = useState(selectedDate?.getFullYear()  ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDate?.getMonth()     ?? today.getMonth())

  // 해당 월의 첫째 날 요일 + 마지막 날짜
  const firstDay  = new Date(viewYear, viewMonth, 1).getDay()
  const lastDate  = new Date(viewYear, viewMonth + 1, 0).getDate()

  // 이전 달 마지막 날짜 (앞 빈칸 채우기용)
  const prevLastDate = new Date(viewYear, viewMonth, 0).getDate()

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const handleDayClick = (day: number) => {
    const mm  = String(viewMonth + 1).padStart(2, '0')
    const dd  = String(day).padStart(2, '0')
    onDateChange(`${viewYear}-${mm}-${dd}`)
  }

  const isSelected = (day: number) => {
    if (!selectedDate) return false
    return (
      selectedDate.getFullYear() === viewYear &&
      selectedDate.getMonth()    === viewMonth &&
      selectedDate.getDate()     === day
    )
  }

  const isToday = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth()    === viewMonth &&
    today.getDate()     === day

  const isPast = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(0, 0, 0, 0)
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return d < t
  }

  // 달력 셀 배열 (이전 달 / 이번 달 / 다음 달 채우기)
  const cells: { day: number; type: 'prev' | 'cur' | 'next' }[] = []
  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: prevLastDate - firstDay + 1 + i, type: 'prev' })
  }
  for (let d = 1; d <= lastDate; d++) {
    cells.push({ day: d, type: 'cur' })
  }
  const remaining = 42 - cells.length  // 6주 고정
  for (let i = 1; i <= remaining; i++) {
    cells.push({ day: i, type: 'next' })
  }

  return (
    <div className="space-y-4">
      {/* 달력 */}
      <div className="rounded-xl border border-border bg-white p-3 select-none">
        {/* 월 네비게이션 */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold">
            {viewYear}년 {viewMonth + 1}월
          </p>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={[
                'text-center text-xs font-medium py-1',
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground',
              ].join(' ')}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((cell, idx) => {
            if (cell.type !== 'cur') {
              return <div key={`other-${idx}`} className="h-8" />
            }
            const past    = isPast(cell.day)
            const today_  = isToday(cell.day)
            const sel     = isSelected(cell.day)
            const sunday  = (firstDay + cell.day - 1) % 7 === 0
            const saturday = (firstDay + cell.day - 1) % 7 === 6

            return (
              <button
                key={`cur-${cell.day}`}
                type="button"
                disabled={past}
                onClick={() => handleDayClick(cell.day)}
                className={[
                  'h-8 w-full rounded-lg text-xs font-medium transition-colors',
                  sel
                    ? 'bg-primary text-primary-foreground'
                    : today_
                      ? 'border border-primary text-primary'
                      : past
                        ? 'text-muted-foreground/40 cursor-not-allowed'
                        : sunday
                          ? 'text-red-500 hover:bg-muted'
                          : saturday
                            ? 'text-blue-500 hover:bg-muted'
                            : 'hover:bg-muted',
                ].join(' ')}
              >
                {cell.day}
              </button>
            )
          })}
        </div>
      </div>

      {/* 시간 선택 */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">시간 선택</p>

        {/* 시 선택 */}
        <div>
          <p className="text-xs text-muted-foreground/70 mb-1.5">시</p>
          <div className="flex flex-wrap gap-1.5">
            {HOUR_OPTIONS.map((h) => {
              const hStr = String(h).padStart(2, '0')
              const selectedHour = time ? time.split(':')[0] : ''
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    const min = time ? time.split(':')[1] : '00'
                    onTimeChange(`${hStr}:${min}`)
                  }}
                  className={[
                    'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    selectedHour === hStr
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/40 hover:bg-muted',
                  ].join(' ')}
                >
                  {h}시
                </button>
              )
            })}
          </div>
        </div>

        {/* 분 선택 */}
        <div>
          <p className="text-xs text-muted-foreground/70 mb-1.5">분</p>
          <div className="flex gap-2">
            {MINUTE_OPTIONS.map((m) => {
              const selectedMin = time ? time.split(':')[1] : ''
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    const hour = time ? time.split(':')[0] : '09'
                    onTimeChange(`${hour}:${m}`)
                  }}
                  className={[
                    'rounded-lg border px-5 py-2 text-xs font-medium transition-colors',
                    selectedMin === m
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/40 hover:bg-muted',
                  ].join(' ')}
                >
                  {m}분
                </button>
              )
            })}
          </div>
        </div>

        {/* 선택된 시간 표시 */}
        {time && (
          <p className="text-xs text-muted-foreground">
            선택된 시간: <span className="font-semibold text-primary">{time}</span>
          </p>
        )}
      </div>
    </div>
  )
}
