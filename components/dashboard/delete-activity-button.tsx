'use client'

import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { deleteLeadActivityAction } from '@/lib/actions/crm'

// 상담 기록 삭제 버튼 — 잘못 추가했거나 녹음 정리가 틀렸을 때. 파괴적 액션이라 confirm 필수.
// 영업(pipeline)·고객(clients) 상세 양쪽에서 공용으로 사용.
export function DeleteActivityButton({ activityId }: { activityId: string }) {
  const router = useRouter()
  const { execute, isPending } = useAction(deleteLeadActivityAction, {
    onSuccess: () => {
      toast.success('상담 기록을 삭제했어요')
      router.refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '삭제하지 못했어요. 다시 시도해주세요'),
  })

  return (
    <button
      type="button"
      onClick={() => {
        if (!confirm('이 상담 기록을 삭제할까요?\n삭제하면 되돌릴 수 없어요.')) return
        execute({ activityId })
      }}
      disabled={isPending}
      className="shrink-0 self-start p-1 -m-1 text-muted-foreground hover:text-red-500 disabled:opacity-40"
      aria-label="상담 기록 삭제"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
