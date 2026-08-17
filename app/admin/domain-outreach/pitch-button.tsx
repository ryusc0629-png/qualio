'use client'

import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { markDomainPitchAction } from '@/lib/actions/admin-request'

interface Props {
  businessId: string
  contacted: boolean
}

/** 연락했음을 기록 — 기록해두면 60일 동안 명단 아래로 내려간다 */
export function PitchButton({ businessId, contacted }: Props) {
  const router = useRouter()

  const mark = useAction(markDomainPitchAction, {
    onSuccess: () => {
      toast.success(contacted ? '기록을 지웠어요' : '연락함으로 기록했어요')
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '기록하지 못했어요')
    },
  })

  return (
    <Button
      type="button"
      size="sm"
      variant={contacted ? 'ghost' : 'outline'}
      disabled={mark.isPending}
      onClick={() => mark.execute({ businessId, contacted: !contacted })}
    >
      {mark.isPending ? '기록 중...' : contacted ? '기록 지우기' : '연락함'}
    </Button>
  )
}
