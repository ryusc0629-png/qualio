'use client'

import { useState, useEffect, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import { updateLeadActivityAction } from '@/lib/actions/crm'

// 상담/미팅 내용 — 읽기(길면 4줄로 접고 더보기) + 인라인 수정.
// 녹음 정리나 메모가 틀렸을 때 삭제 후 재작성 없이 바로 고칠 수 있게 한다.
export function EditableActivityContent({
  activityId,
  content,
}: {
  activityId: string
  content: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(content ?? '')

  // 읽기 모드에서 넘치는지 측정 → '더보기' 노출 여부 결정
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && !expanded) setClamped(el.scrollHeight > el.clientHeight + 1)
  }, [content, expanded, editing])

  const { execute, isPending } = useAction(updateLeadActivityAction, {
    onSuccess: () => {
      toast.success('내용을 수정했어요')
      setEditing(false)
      router.refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '수정 못 했어요. 다시 눌러주세요'),
  })

  const save = () => {
    const trimmed = value.trim()
    if (!trimmed) {
      toast.error('내용을 입력해주세요')
      return
    }
    execute({ activityId, content: trimmed })
  }

  // ── 수정 모드 ──
  if (editing) {
    return (
      <div className="mt-1 space-y-2">
        <Textarea
          ref={(el) => el?.focus()}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          className="text-sm"
          placeholder="미팅 내용을 입력하세요"
        />
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={isPending} className="h-9">
            {isPending ? '저장 중...' : '저장하기'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(content ?? '')
              setEditing(false)
            }}
            disabled={isPending}
            className="h-9"
          >
            취소
          </Button>
        </div>
      </div>
    )
  }

  // ── 읽기 모드 ──
  return (
    <div className="mt-0.5">
      <p
        ref={ref}
        className={`text-sm text-muted-foreground whitespace-pre-wrap ${expanded ? '' : 'line-clamp-4'}`}
      >
        {content}
      </p>
      <div className="flex items-center gap-3 mt-1">
        {clamped && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-primary"
          >
            {expanded ? '접기' : '더보기'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setValue(content ?? '')
            setEditing(true)
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          수정
        </button>
      </div>
    </div>
  )
}
