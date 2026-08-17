'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { updateBusinessRequestAction } from '@/lib/actions/admin-request'

interface Props {
  id: string
  status: string
}

/** 접수 → 처리 중 → 완료 로 옮기는 버튼 묶음 */
export function RequestRowActions({ id, status }: Props) {
  const router = useRouter()
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)

  const update = useAction(updateBusinessRequestAction, {
    onSuccess: () => {
      toast.success('바꿨어요')
      setPendingTarget(null)
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '바꾸지 못했어요')
      setPendingTarget(null)
    },
  })

  const buttons = [
    { value: 'in_progress', label: '처리 중' },
    { value: 'done', label: '완료' },
    { value: 'requested', label: '접수로 되돌리기' },
  ].filter((b) => b.value !== status)

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <Button
          key={b.value}
          type="button"
          size="sm"
          variant={b.value === 'done' ? 'default' : 'outline'}
          disabled={update.isPending}
          onClick={() => {
            setPendingTarget(b.value)
            update.execute({ id, status: b.value })
          }}
        >
          {update.isPending && pendingTarget === b.value ? '바꾸는 중...' : b.label}
        </Button>
      ))}
    </div>
  )
}
