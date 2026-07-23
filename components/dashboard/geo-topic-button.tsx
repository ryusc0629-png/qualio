'use client'

import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { generatePostAction } from '@/lib/actions/posts'
import { PenLine, Loader2 } from 'lucide-react'

// "안 잡히는 질문"을 실제 검색 키워드로 정리 — 끝의 구매의도 말꼬리를 떼어 본문·태그 최적화에 씀.
// 예: "울산 청소업체 추천" → "울산 청소", "울산 정기청소 잘하는 곳" → "울산 정기청소"
function deriveKeyword(question: string): string {
  return question
    .replace(/(업체\s*)?(추천(해줘)?|잘하는\s*곳|어디가?\s*좋아\??|전문\s*업체|비용|가격)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// 질문 하나를 주제로 홍보 글을 생성·발행하는 버튼 — 개선 루프의 핵심(측정→발행→상승).
function GeoTopicButton({ question }: { question: string }) {
  const router = useRouter()
  const { execute, isPending } = useAction(generatePostAction, {
    onSuccess: () => {
      toast.success('글을 만들었어요! ‘마케팅 포스팅’ 목록에 저장됐어요')
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '글을 못 만들었어요. 잠시 후 다시 눌러주세요')
    },
  })

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-9 shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
      disabled={isPending}
      onClick={() => execute({ topic: question, keyword: deriveKeyword(question) || undefined })}
    >
      {isPending ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          글 만드는 중...
        </>
      ) : (
        <>
          <PenLine className="mr-1.5 h-3.5 w-3.5" />
          글 쓰기
        </>
      )}
    </Button>
  )
}

// "안 잡히는 질문" 목록 — 각 질문 옆에 글 생성 버튼. 눌러 글이 쌓이면 다음 측정 때 노출률이 오른다.
export function GeoWeakQuestions({ questions }: { questions: string[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {questions.map((q) => (
        <li key={q} className="flex items-center justify-between gap-3">
          <span className="text-sm text-amber-900/80 min-w-0 truncate">· {q}</span>
          <GeoTopicButton question={q} />
        </li>
      ))}
    </ul>
  )
}
