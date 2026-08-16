'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { deleteLeadAction } from '@/lib/actions/crm'
import { Trash2 } from 'lucide-react'

interface DeleteLeadButtonProps {
  leadId: string
  leadName: string
  /** 이 거래처로 보낸 견적서 장수 — 1장이라도 있으면 삭제 차단 */
  quoteCount: number
  /** 함께 지워질 상담 기록 개수 — 확인창에 미리 알려준다 */
  activityCount: number
}

export function DeleteLeadButton({ leadId, leadName, quoteCount, activityCount }: DeleteLeadButtonProps) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    // 견적서가 있으면 지울 수 없다(서버에서도 막는다) — 이유와 다음 행동을 먼저 알려준다
    if (quoteCount > 0) {
      toast.error(`견적서 ${quoteCount}장이 있어 삭제할 수 없어요. 견적서를 먼저 지워주세요`)
      return
    }

    const extra = activityCount > 0 ? `\n상담 기록 ${activityCount}개도 함께 지워져요.` : ''
    if (!window.confirm(`"${leadName}"을(를) 완전히 삭제할까요?${extra}\n\n되돌릴 수 없어요.`)) return

    startTransition(async () => {
      const result = await deleteLeadAction({ leadId })
      if (result?.serverError) {
        toast.error(result.serverError)
      } else {
        toast.success('삭제했어요')
      }
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
      title="완전 삭제"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
