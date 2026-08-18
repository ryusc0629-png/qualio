'use client'

import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createBusinessRequestAction } from '@/lib/actions/business-request'
import { Loader2, CheckCircle2 } from 'lucide-react'

// "저희가 대신 해드릴게요" — 구글 지도 정리를 본사에 맡기는 버튼.
//
// 왜 있나: 구글 비즈니스 프로필은 계정 만들기·소유 확인(엽서 또는 영상)·업종 고르기까지
// 넘어야 해서, 컴퓨터가 익숙하지 않은 사장님이 혼자 하다 중간에 멈춘다.
// 네이버 스마트플레이스처럼 한국어 안내가 친절하지도 않다.
// 그래서 '직접 하기'를 기본으로 두지 않고, 맡기는 길을 먼저 보여준다.
export function GoogleHelpButton({ requestStatus }: { requestStatus?: string | null }) {
  const router = useRouter()

  const { execute, isPending } = useAction(createBusinessRequestAction, {
    onSuccess: ({ data }) => {
      toast.success(
        data?.alreadyOpen ? '이미 접수돼 있어요. 곧 연락드릴게요' : '접수했어요! 저희가 연락드릴게요',
      )
      router.refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '접수 못 했어요. 다시 눌러주세요'),
  })

  // 이미 맡겨둔 상태 — 또 누르지 않도록 진행 상황만 보여준다
  if (requestStatus && requestStatus !== 'done') {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
        <p className="text-sm text-emerald-900">
          맡겨주셨어요. 저희가 확인하고 <b>연락드릴게요</b> — 따로 하실 일 없어요
        </p>
      </div>
    )
  }

  return (
    <Button type="button" onClick={() => execute({ kind: 'google_maps_setup' })} disabled={isPending} className="h-12 w-full sm:w-auto">
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          접수 중...
        </>
      ) : (
        '저희가 대신 해드릴게요'
      )}
    </Button>
  )
}
