'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { setCustomerOnMyWayAction } from '@/lib/actions/customers'

// 기사 출발 알림 수신 설정 토글 — 고객마다 필요/불필요가 갈리므로 켜고 끌 수 있게.
// 끄면 현장 직원·대표 화면에서 출발 알림 버튼이 숨겨지고 발송도 차단된다.
export function CustomerOnMyWayToggle({
  customerId,
  initialOn,
}: {
  customerId: string
  initialOn: boolean
}) {
  const [on, setOn] = useState(initialOn)

  const { execute, isPending } = useAction(setCustomerOnMyWayAction, {
    onSuccess: ({ data }) => {
      if (data) {
        setOn(data.enabled)
        toast.success(data.enabled ? '출발 알림을 켰어요' : '출발 알림을 껐어요')
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const toggle = () => {
    const next = !on
    setOn(next) // 낙관적
    execute({ customerId, enabled: next })
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
      <div className="flex items-start gap-2 min-w-0">
        <Send className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium">기사 출발 알림</p>
          <p className="text-xs text-muted-foreground">
            방문 직전 “곧 도착해요” 알림톡을 보낼지 설정해요
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={isPending}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          on ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
