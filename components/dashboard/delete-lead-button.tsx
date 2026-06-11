'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { deleteLeadAction } from '@/lib/actions/crm'
import { Trash2 } from 'lucide-react'

interface DeleteLeadButtonProps {
  leadId: string
  leadName: string
}

export function DeleteLeadButton({ leadId, leadName }: DeleteLeadButtonProps) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!window.confirm(`"${leadName}"을(를) 삭제하시겠습니까?`)) return

    startTransition(async () => {
      const result = await deleteLeadAction({ leadId })
      if (result?.serverError) {
        toast.error(result.serverError)
      } else {
        toast.success('삭제됐어요')
      }
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
      title="삭제"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
