'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { updateCustomerSalesStageAction } from '@/lib/actions/customers'
import { SALES_STAGES, salesStageMeta } from '@/lib/business/sales-stage'

// 거래처 '영업 상태' 선택 — 자동 일회성/정기 배지와 별개.
// 값이 있으면 색 배지처럼 보이고, 눌러 단계를 바꾸거나 '영업 없음'으로 되돌린다.
export function CustomerSalesStageSelect({
  customerId,
  currentStage,
}: {
  customerId: string
  currentStage: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const meta = salesStageMeta(currentStage)

  const handleChange = (stage: string) => {
    startTransition(async () => {
      const result = await updateCustomerSalesStageAction({ customerId, stage })
      if (result?.serverError) {
        toast.error(result.serverError)
      } else {
        toast.success(stage ? '영업 상태를 바꿨어요' : '영업 상태를 지웠어요')
      }
    })
  }

  // 값이 있으면 해당 색, 없으면 회색 점선 느낌(설정 유도)
  const className = meta
    ? `${meta.className} border-transparent`
    : 'bg-background text-muted-foreground border-dashed border-border'

  return (
    <select
      value={currentStage ?? ''}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      aria-label="영업 상태"
      className={`text-xs rounded-full px-2 py-1 border font-medium cursor-pointer disabled:opacity-50 ${className}`}
    >
      <option value="">영업 없음</option>
      {SALES_STAGES.map((opt) => (
        <option key={opt.value} value={opt.value}>
          영업 중 · {opt.label}
        </option>
      ))}
    </select>
  )
}
