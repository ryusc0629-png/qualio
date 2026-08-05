'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

// 구독 취소 버튼 — 확인 후 /api/payment/cancel 호출
export function CancelSubscriptionButton() {
  const [isPending, startTransition] = useTransition()

  const handleCancel = () => {
    const confirmed = window.confirm(
      '구독을 취소하시겠습니까?\n\n현재 결제 기간이 끝날 때까지는 서비스를 계속 이용할 수 있습니다.\n환불을 원하시면 고객센터로 문의해주세요.'
    )
    if (!confirmed) return

    startTransition(async () => {
      try {
        const res = await fetch('/api/payment/cancel', { method: 'POST' })
        const data = await res.json() as { success?: boolean; error?: string }

        if (!res.ok) {
          toast.error(data.error ?? '구독 취소 못 했어요. 다시 눌러주세요')
          return
        }

        toast.success('구독을 취소했어요. 결제 기간 끝까지는 그대로 쓸 수 있어요')
        window.location.replace('/dashboard/settings')
      } catch {
        toast.error('연결이 불안정해요. 인터넷 확인 후 다시 눌러주세요')
      }
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCancel}
      disabled={isPending}
      className="text-muted-foreground hover:text-destructive"
    >
      {isPending ? '처리 중...' : '구독 취소'}
    </Button>
  )
}
