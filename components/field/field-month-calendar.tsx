'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MapPin, ChevronRight, CalendarOff } from 'lucide-react'

// 직원·도급사가 한 달 일정을 한눈에 보는 달력.
// 오늘 할 일 화면(/field/[workerId])은 '지금 뭘 하지'에 집중하고, 이 화면은 '언제 비었지'를 본다.
//
// 날짜 계산(달의 시작·요일 자리·공휴일)은 전부 서버에서 한국 시간 기준으로 끝내서 넘긴다.
// 브라우저에서 다시 계산하면 폰 시간대에 따라 하루가 밀린다.

export interface CalendarJob {
  id: string
  time: string // '오전 9:00'
  customerName: string
  address: string | null
  status: string
}

export interface CalendarCell {
  ymd: string // '2026-09-01'
  day: number
  weekday: number // 0=일 ~ 6=토
  holiday: string | null
  isPast: boolean
}

interface Props {
  workerId: string
  cells: CalendarCell[]
  leadingBlanks: number
  jobsByDate: Record<string, CalendarJob[]>
  todayYmd: string
  initialSelected: string
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export function FieldMonthCalendar({
  workerId,
  cells,
  leadingBlanks,
  jobsByDate,
  todayYmd,
  initialSelected,
}: Props) {
  const [selected, setSelected] = useState(initialSelected)

  const selectedJobs = jobsByDate[selected] ?? []
  const selectedCell = cells.find((c) => c.ymd === selected)
  const selectedLabel = selectedCell
    ? `${selectedCell.day}일 (${WEEKDAY_LABELS[selectedCell.weekday]})`
    : ''

  return (
    <div className="space-y-4">
      {/* 요일 머리 */}
      <div>
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={`text-center text-xs font-medium py-1 ${
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* 날짜 칸 — 일정 있는 날은 색이 차 있고, 빈 날은 비어 보인다(쉬는 날 찾기) */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}

          {cells.map((cell) => {
            const count = (jobsByDate[cell.ymd] ?? []).length
            const isToday = cell.ymd === todayYmd
            const isSelected = cell.ymd === selected
            const isRed = cell.weekday === 0 || cell.holiday !== null
            const isBlue = cell.weekday === 6

            return (
              <button
                key={cell.ymd}
                type="button"
                onClick={() => setSelected(cell.ymd)}
                className={[
                  'min-h-14 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-colors',
                  count > 0 ? 'bg-primary/10 border-primary/20' : 'bg-white border-transparent',
                  isSelected ? 'ring-2 ring-primary border-primary' : '',
                  cell.isPast && !isSelected ? 'opacity-50' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'text-sm',
                    isToday ? 'font-bold' : count > 0 ? 'font-semibold' : 'font-normal',
                    isRed ? 'text-red-500' : isBlue ? 'text-blue-500' : 'text-foreground',
                  ].join(' ')}
                >
                  {cell.day}
                </span>
                {count > 0 ? (
                  <span className="text-[10px] font-semibold text-primary leading-none">
                    {count}곳
                  </span>
                ) : (
                  <span className="text-[10px] leading-none">&nbsp;</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 고른 날짜의 일정 */}
      <div>
        <h2 className="text-sm font-semibold mb-2">{selectedLabel} 일정</h2>

        {selectedJobs.length === 0 ? (
          <div className="rounded-xl border bg-white px-4 py-8 text-center space-y-1.5">
            <CalendarOff className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">이 날은 배정된 작업이 없어요</p>
            {selectedCell?.holiday && (
              <p className="text-xs text-red-500">{selectedCell.holiday}</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border bg-white divide-y">
            {selectedJobs.map((job) => (
              <Link
                key={job.id}
                href={`/field/${workerId}/${job.id}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium shrink-0">{job.time}</span>
                    <span className="text-sm truncate">{job.customerName}</span>
                  </div>
                  {job.address && (
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{job.address}</span>
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
