'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Receipt, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sendReceiptAction } from '@/lib/actions/receipts'

interface SendReceiptButtonProps {
  bookingId:      string
  businessId:     string
  customerPhone:  string | null
  /** 발송에 성공했을 때 — 부모가 '보냄'으로 즉시 바꿀 수 있게 알린다 */
  onSent?:        () => void
}

// 영수증 '다시' 보내기 버튼.
// 정상 경로에서는 현장 앱의 '수금 완료'가 영수증을 자동으로 보내므로 이 버튼은 뜨지 않는다.
// 자동 발송이 실패해 아직 안 나간 예약에서만 나타나는 복구 수단이다.
export function SendReceiptButton({ bookingId, businessId, customerPhone, onSent }: SendReceiptButtonProps) {
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)

  const { execute, isPending } = useAction(sendReceiptAction, {
    onSuccess: ({ data }) => {
      toast.success('영수증을 보냈어요!')
      if (data?.receiptUrl) setReceiptUrl(data.receiptUrl)
      onSent?.()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '발송에 실패했어요. 다시 눌러주세요'),
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const previewUrl = receiptUrl ?? `${appUrl}/q/${businessId}/receipt/${bookingId}`

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-9 gap-1.5"
          disabled={isPending || !customerPhone}
          onClick={() => execute({ bookingId })}
        >
          <Receipt className="h-3.5 w-3.5" />
          {isPending ? '보내는 중...' : '영수증 보내기'}
        </Button>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          미리보기
        </a>
      </div>
      {!customerPhone && (
        <p className="text-xs text-muted-foreground">고객 연락처가 없어 알림톡 발송이 불가해요</p>
      )}
    </div>
  )
}
