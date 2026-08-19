'use client'

import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { runGeoCheckAction } from '@/lib/actions/geo-measure'
import { Search, Loader2 } from 'lucide-react'

// "지금 측정하기" 버튼 — 즉시 AI 검색 노출률을 측정하고 화면을 새로고침한다.
//
// 걸리는 시간을 미리 알려준다: 검색어 30개를 세 AI에 각각 물어보느라 1~2분이 걸린다.
// 안 알려주면 30초쯤에서 "멈췄나?" 하고 새로고침하거나 다시 누르게 된다.
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
    <div className="w-full sm:w-auto">
      <Button
        type="button"
        onClick={() => {
          toast.info('측정을 시작했어요. 최대 2분 걸려요 — 이 화면을 열어두세요')
          execute({})
        }}
        disabled={isPending}
        className="h-12 w-full sm:w-auto"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            측정 중... 최대 2분
          </>
        ) : (
          <>
            <Search className="mr-2 h-4 w-4" />
            {label}
          </>
        )}
      </Button>
      <p className="mt-1.5 text-xs text-muted-foreground text-center sm:text-right">
        {isPending
          ? '검색어 30개를 세 곳에 물어보는 중이에요. 창을 닫지 말아주세요'
          : '검색어 30개를 AI 세 곳에 물어봐요 · 최대 2분'}
      </p>
    </div>
  )
}
