'use client'

import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { makeReelNowAction } from '@/lib/actions/reel'
import { Wand2, Loader2 } from 'lucide-react'

// 평소엔 새벽에 알아서 만들어진다. 이 버튼은 '오늘 찍은 걸 오늘 올리고 싶을 때'를 위한 것.
//
// 만드는 데 30초쯤 걸린다(대본 → 문장별 음성 → 편집 요청). 걸리는 시간을 미리 말해두지 않으면
// 20초쯤에서 멈춘 줄 알고 다시 누른다.
export function ReelMakeNowButton({ reportId }: { reportId: string }) {
  const router = useRouter()
  const { execute, isPending } = useAction(makeReelNowAction, {
    onSuccess: () => {
      toast.success('영상을 만들기 시작했어요. 1~2분 뒤에 여기 나타나요')
      router.refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 gap-1.5 shrink-0"
      disabled={isPending}
      onClick={() => {
        toast.info('만드는 중이에요. 30초쯤 걸려요 — 이 화면을 열어두세요')
        execute({ reportId })
      }}
    >
      {isPending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          만드는 중...
        </>
      ) : (
        <>
          <Wand2 className="h-3.5 w-3.5" />
          지금 만들기
        </>
      )}
    </Button>
  )
}
