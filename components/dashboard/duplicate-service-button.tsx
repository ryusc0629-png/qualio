'use client'

import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'
import { duplicateServiceItemAction } from '@/lib/actions/services'

// 서비스 복제 버튼 — 원본 설정 그대로 복사 후, 이름만 바꿔 쓰도록 안내
export function DuplicateServiceButton({ id }: { id: string }) {
  const { execute, isPending } = useAction(duplicateServiceItemAction, {
    onSuccess: () => toast.success('복제했어요. 연필 버튼으로 이름을 바꿔주세요'),
    onError: ({ error }) => toast.error(error.serverError ?? '복제하지 못했어요. 다시 눌러주세요'),
  })

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => execute({ id })}
      className="text-muted-foreground hover:text-primary"
      aria-label="서비스 복제"
      title="복제"
    >
      <Copy className="h-4 w-4" />
    </Button>
  )
}
