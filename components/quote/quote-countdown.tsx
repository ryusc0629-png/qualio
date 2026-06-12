'use client'

import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'

interface QuoteCountdownProps {
  expiresAt: string   // ISO date string
  isUrgent: boolean
  isExpired: boolean
}

function calcRemaining(expiresAt: string) {
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now())
  const totalSecs = Math.floor(diff / 1000)
  const hours   = Math.floor(totalSecs / 3600)
  const minutes = Math.floor((totalSecs % 3600) / 60)
  const seconds = totalSecs % 60
  return { hours, minutes, seconds, expired: totalSecs === 0 }
}

export function QuoteCountdown({ expiresAt, isUrgent, isExpired }: QuoteCountdownProps) {
  const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt))

  useEffect(() => {
    // 이미 만료됐으면 타이머 불필요
    if (isExpired) return

    const id = setInterval(() => {
      const next = calcRemaining(expiresAt)
      setRemaining(next)
      if (next.expired) clearInterval(id)
    }, 1000)

    return () => clearInterval(id)
  }, [expiresAt, isExpired])

  // 만료된 경우
  if (isExpired || remaining.expired) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl px-4 py-3 bg-red-50 border border-red-200">
        <Clock className="h-4 w-4 shrink-0 text-red-500" />
        <p className="text-xs font-semibold break-keep text-red-700">
          이 견적은 만료됐어요. 새 견적을 다시 요청해 주세요.
        </p>
      </div>
    )
  }

  // 시간 포맷: 00시간 00분 00초
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(remaining.hours)}시간 ${pad(remaining.minutes)}분 ${pad(remaining.seconds)}초`

  return (
    <div className={[
      'flex items-center gap-2.5 rounded-2xl px-4 py-3',
      isUrgent
        ? 'bg-amber-50 border border-amber-200'
        : 'bg-primary/10 border border-primary/30',
    ].join(' ')}>
      <Clock className="h-4 w-4 shrink-0 text-primary" />
      <p className={[
        'text-xs font-semibold break-keep',
        isUrgent ? 'text-amber-800' : 'text-[#7A4200]',
      ].join(' ')}>
        {isUrgent
          ? `⚡ 견적이 곧 만료돼요! — `
          : '이 견적은 '}
        <span className="tabular-nums font-black text-sm">
          {timeStr}
        </span>
        {' 후 만료됩니다'}
      </p>
    </div>
  )
}
