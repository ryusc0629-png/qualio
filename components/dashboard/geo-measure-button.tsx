'use client'

import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { runGeoCheckAction } from '@/lib/actions/geo-measure'
import { Search, Loader2 } from 'lucide-react'

// "지금 측정하기" 버튼 — 즉시 AI 검색 노출률을 측정하고 화면을 새로고침한다.
export function GeoMeasureButton({ label = '지금 측정하기' }: { label?: string }) {
  const router = useRouter()
  const { execute, isPending } = useAction(runGeoCheckAction, {
    onSuccess: ({ data }) => {
      toast.success(`측정했어요! 질문 ${data?.total ?? 0}개 중 ${data?.cited ?? 0}개에서 우리 업체가 잡혔어요`)
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '측정을 못 했어요. 잠시 후 다시 눌러주세요')
    },
  })

  return (
    <Button
      type="button"
      onClick={() => execute({})}
      disabled={isPending}
      className="h-12 w-full sm:w-auto"
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          측정 중...
        </>
      ) : (
        <>
          <Search className="mr-2 h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  )
}
