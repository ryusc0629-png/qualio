'use client'

import { useAction } from 'next-safe-action/hooks'
import { cancelPlanChangeAction } from '@/lib/actions/subscription'
import { Button } from '@/components/ui/button'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

// 예약된 플랜 변경 취소 버튼
export function CancelPlanChangeButton() {
  const { execute, isPending } = useAction(cancelPlanChangeAction, {
    onSuccess: () => {
      toast.success('플랜 변경 예약이 취소됐어요')
      window.location.replace('/dashboard/settings')
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '취소에 실패했어요')
    },
  })

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 gap-1 h-8 px-2"
      disabled={isPending}
      onClick={() => execute({})}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
      {isPending ? '취소 중...' : '변경 취소'}
    </Button>
  )
}
