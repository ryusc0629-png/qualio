'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { snoozeFollowUpAction } from '@/lib/actions/crm'
import { Clock } from 'lucide-react'

interface FollowUpSnoozeButtonProps {
  leadId: string
}

// KST 기준 오늘 + days 일의 "YYYY-MM-DD" 반환
function kstDateAfter(days: number): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  kst.setUTCDate(kst.getUTCDate() + days)
  return kst.toISOString().slice(0, 10)
}

export function FollowUpSnoozeButton({ leadId }: FollowUpSnoozeButtonProps) {
  const [open, setOpen] = useState(false)
  // 기본값: 내일 — 최소 선택 가능일도 내일
  const [date, setDate] = useState(() => kstDateAfter(1))
  const tomorrow = kstDateAfter(1)

  const { execute, isPending } = useAction(snoozeFollowUpAction, {
    onSuccess: () => {
      toast.success('연락 일정을 미뤘어요')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={isPending}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors disabled:opacity-50"
        aria-label="연락 일정 미루기"
      >
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <>
          {/* 바깥 클릭 닫기 */}
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
            }}
          />
          <div
            className="absolute right-0 top-9 z-20 w-56 rounded-lg border border-border bg-white shadow-lg p-3 space-y-2.5"
            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          >
            <p className="text-[11px] font-medium text-muted-foreground">
              언제 다시 연락할까요?
            </p>
            <input
              type="date"
              value={date}
              min={tomorrow}
              onChange={(e) => setDate(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-10 rounded-lg border border-border bg-background px-2.5 text-sm"
            />
            <button
              type="button"
              disabled={isPending || !date}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                execute({ leadId, date })
              }}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? '미루는 중...' : '이 날짜로 미루기'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
