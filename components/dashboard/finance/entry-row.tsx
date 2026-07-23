'use client'

// 기록 한 줄 — 탭하면 수정 창(수정·삭제) 열림
import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown, Pencil } from 'lucide-react'
import { updateFinanceEntryAction, deleteFinanceEntryAction } from '@/lib/actions/finance'
import { formatWon } from '@/lib/finance/constants'
import { EntryFormModal, type EntryType } from '@/components/dashboard/finance/entry-form-modal'

export interface EntryRowData {
  id: string
  type: string
  category: string
  amount: number
  memo: string | null
  entry_date: string
}

export function EntryRow({ entry }: { entry: EntryRowData }) {
  const [open, setOpen] = useState(false)
  const isRev = entry.type === 'revenue'
  const md = `${Number(entry.entry_date.slice(5, 7))}월 ${Number(entry.entry_date.slice(8, 10))}일`

  const update = useAction(updateFinanceEntryAction, {
    onSuccess: () => {
      toast.success('기록을 고쳤어요')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const del = useAction(deleteFinanceEntryAction, {
    onSuccess: () => {
      toast.success('기록을 지웠어요')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 py-3 px-1 -mx-1 text-left rounded-lg hover:bg-muted/40 transition-colors"
      >
        <span
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            isRev ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
          }`}
        >
          {isRev ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {entry.category}
            {entry.memo && <span className="text-muted-foreground font-normal"> · {entry.memo}</span>}
          </p>
          <p className="text-xs text-muted-foreground">{md}</p>
        </div>
        <span className={`font-bold tabular-nums shrink-0 ${isRev ? 'text-emerald-600' : 'text-rose-500'}`}>
          {isRev ? '+' : '-'}{formatWon(entry.amount)}
        </span>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      </button>

      <EntryFormModal
        open={open}
        mode="edit"
        initial={{
          type: entry.type as EntryType,
          amount: entry.amount,
          category: entry.category,
          entry_date: entry.entry_date,
          memo: entry.memo ?? undefined,
        }}
        isPending={update.isPending}
        onClose={() => setOpen(false)}
        onSubmit={(v) => update.execute({ id: entry.id, ...v })}
        onDelete={() => {
          if (window.confirm(`'${entry.category} ${formatWon(entry.amount)}' 기록을 지울까요?`)) {
            del.execute({ id: entry.id })
          }
        }}
        deletePending={del.isPending}
      />
    </>
  )
}
