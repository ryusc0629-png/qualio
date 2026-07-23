'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { addFinanceEntryAction } from '@/lib/actions/finance'
import { EntryFormModal, type EntryType } from '@/components/dashboard/finance/entry-form-modal'

interface AddEntryFormProps {
  // 트리거 버튼을 꽉 찬 형태로 쓸지(빈 상태 카드 안 등)
  fullWidth?: boolean
  // 처음 열 때 매출/지출 중 무엇을 선택할지
  defaultType?: EntryType
  triggerLabel?: string
}

export function AddEntryForm({ fullWidth = false, defaultType = 'revenue', triggerLabel = '기록 추가' }: AddEntryFormProps) {
  const [open, setOpen] = useState(false)
  const lastType = useRef<EntryType>(defaultType)

  const { execute, isPending } = useAction(addFinanceEntryAction, {
    onSuccess: () => {
      toast.success(lastType.current === 'revenue' ? '매출을 기록했어요!' : '지출을 기록했어요!')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <>
      <Button onClick={() => setOpen(true)} className={fullWidth ? 'w-full h-12' : 'h-11'}>
        <Plus className="h-4 w-4 mr-1.5" />
        {triggerLabel}
      </Button>
      <EntryFormModal
        open={open}
        mode="add"
        initial={{ type: defaultType }}
        isPending={isPending}
        onClose={() => setOpen(false)}
        onSubmit={(v) => {
          lastType.current = v.type
          execute(v)
        }}
      />
    </>
  )
}
