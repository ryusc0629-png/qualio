'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { User } from 'lucide-react'
import { assignClaimAction } from '@/lib/actions/claims'

interface WorkerOpt {
  id: string
  name: string
}

interface Props {
  claimId: string
  currentWorkerId: string | null
  workers: WorkerOpt[]
  onChanged?: () => void
}

// 클레임 담당자 지정 — 드롭다운으로 선택하면 바로 저장된다.
export function ClaimAssignee({ claimId, currentWorkerId, workers, onChanged }: Props) {
  const [workerId, setWorkerId] = useState(currentWorkerId ?? '')

  const { execute, isPending } = useAction(assignClaimAction, {
    onSuccess: () => { toast.success('담당자를 정했어요'); onChanged?.() },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 직원이 없으면 배정 UI를 숨김
  if (workers.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground shrink-0">담당</span>
      <select
        value={workerId}
        disabled={isPending}
        onChange={(e) => {
          const v = e.target.value
          setWorkerId(v)
          execute({ claimId, workerId: v || null })
        }}
        className="h-8 rounded-lg border border-border bg-background px-2 text-xs max-w-[8rem]"
      >
        <option value="">미정</option>
        {workers.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </div>
  )
}
