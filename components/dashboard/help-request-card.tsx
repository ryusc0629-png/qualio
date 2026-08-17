'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createBusinessRequestAction } from '@/lib/actions/business-request'
import { CheckCircle2, Loader2 } from 'lucide-react'

interface Props {
  /** 'domain_setup' | 'search_indexing' */
  kind: string
  title: string
  /** 왜 필요한지 — 한 줄씩 */
  reasons: string[]
  buttonLabel: string
  /** 접수 뒤 사장님에게 보여줄 안내 (며칠 걸리는지 등) */
  pendingLabel: string
  /** 이미 접수된 요청 상태 ('requested' | 'in_progress' | 'done' | null) */
  requestStatus?: string | null
  /** 메모 입력칸이 필요한 요청이면 placeholder를 넘긴다 */
  notePlaceholder?: string
  noteLabel?: string
}

export function HelpRequestCard({
  kind,
  title,
  reasons,
  buttonLabel,
  pendingLabel,
  requestStatus,
  notePlaceholder,
  noteLabel,
}: Props) {
  const router = useRouter()
  const [note, setNote] = useState('')

  const create = useAction(createBusinessRequestAction, {
    onSuccess: ({ data }) => {
      toast.success(data?.alreadyOpen ? '이미 접수돼 있어요. 곧 연락드릴게요' : '접수했어요! 저희가 대신 처리할게요')
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '접수하지 못했어요. 다시 눌러주세요')
    },
  })

  const isOpen = requestStatus === 'requested' || requestStatus === 'in_progress'

  // ── 이미 접수됨 ──
  if (isOpen) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-medium">
            {requestStatus === 'in_progress' ? '지금 처리하고 있어요' : '접수됐어요'}
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed pl-6">{pendingLabel}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">{title}</p>
        <ul className="space-y-1">
          {reasons.map((reason) => (
            <li key={reason} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
              <span className="text-primary shrink-0">·</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      {notePlaceholder && (
        <div className="space-y-1.5">
          {noteLabel && <label className="text-xs font-medium" htmlFor={`note-${kind}`}>{noteLabel}</label>}
          <Input
            id={`note-${kind}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={notePlaceholder}
            className="h-12"
          />
        </div>
      )}

      <Button
        type="button"
        className="h-12 w-full"
        disabled={create.isPending}
        onClick={() => create.execute({ kind, note: note.trim() || undefined })}
      >
        {create.isPending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />접수하는 중...</>
        ) : (
          buttonLabel
        )}
      </Button>
    </div>
  )
}
