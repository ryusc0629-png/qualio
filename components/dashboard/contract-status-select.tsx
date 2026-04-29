'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { updateContractStatusAction } from '@/lib/actions/contracts'

const STATUS_OPTIONS = [
  { value: 'active',     label: '활성' },
  { value: 'paused',     label: '중단' },
  { value: 'terminated', label: '해지' },
]

interface ContractStatusSelectProps {
  contractId: string
  currentStatus: string
}

export function ContractStatusSelect({ contractId, currentStatus }: ContractStatusSelectProps) {
  const [isPending, startTransition] = useTransition()

  const handleChange = (newStatus: string) => {
    startTransition(async () => {
      const result = await updateContractStatusAction({ contractId, status: newStatus })
      if (result?.serverError) {
        toast.error(result.serverError)
      }
    })
  }

  return (
    <select
      value={currentStatus}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      className="text-xs rounded-full px-2 py-0.5 border border-border bg-background cursor-pointer disabled:opacity-50"
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}
