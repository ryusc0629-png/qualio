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

const OPTIONS: { label: string; days: number }[] = [
  { label: '내일', days: 1 },
  { label: '3일 후', days: 3 },
  { label: '1주 후', days: 7 },
]

export function FollowUpSnoozeButton({ leadId }: FollowUpSnoozeButtonProps) {
  const [open, setOpen] = useState(false)

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
          <div className="absolute right-0 top-9 z-20 w-32 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
            <p className="px-3 py-2 text-[11px] font-medium text-muted-foreground border-b border-border">
              언제로 미룰까요?
            </p>
            {OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                disabled={isPending}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  execute({ leadId, date: kstDateAfter(opt.days) })
                }}
                className="block w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
