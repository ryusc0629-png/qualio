'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { createLeadFromQuoteAction } from '@/lib/actions/crm'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface QuoteToLeadButtonProps {
  customerName: string
  customerPhone: string
  cleaningType?: string | null
}

export function QuoteToLeadButton({ customerName, customerPhone, cleaningType }: QuoteToLeadButtonProps) {
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      const result = await createLeadFromQuoteAction({
        customerName,
        customerPhone,
        cleaningType: cleaningType ?? undefined,
      })
      if (result?.serverError) {
        toast.error(result.serverError)
      } else {
        toast.success('고객으로 저장됐어요!')
      }
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={isPending}
      className="h-7 text-xs px-2 border-blue-300 text-blue-700 hover:bg-blue-50"
    >
      <UserPlus className="h-3 w-3 mr-1" />
      {isPending ? '저장 중...' : '고객 저장'}
    </Button>
  )
}
