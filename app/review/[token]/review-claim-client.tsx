'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Star } from 'lucide-react'

interface ReviewClaimClientProps {
  claimId: string
  reviewUrl: string | null
  hasReward: boolean
  /** 후기를 남길 곳 이름 — '구글'·'네이버' 등. 채널이 바뀌어도 문구가 따라오게 밖에서 받는다 */
  platformLabel?: string
  /** 후기에 들어가면 좋은 말 — 예: "울산 남구 사무실 청소". 검색어가 담긴 후기가 훨씬 강하다 */
  keywordHint?: string | null
}

export function ReviewClaimClient({
  claimId,
  reviewUrl,
  hasReward,
  platformLabel = '네이버',
  keywordHint,
}: ReviewClaimClientProps) {
  // rating(별점 입력) → external(공개 리뷰 유도) / private(비공개 감사) / done
  const [step, setStep] = useState<'rating' | 'external' | 'private' | 'done'>('rating')
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [isPending, setIsPending] = useState(false)

  const submit = async () => {
    if (rating === 0 || isPending) return
    setIsPending(true)
    try {
      await fetch('/api/review/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, rating, comment: comment.trim() || undefined }),
      })
    } catch {
      // 실패해도 UX는 진행
    } finally {
      setIsPending(false)
      // 별점 분기: 4점 이상은 공개 리뷰 유도, 3점 이하는 비공개 감사
      if (rating >= 4) setStep(reviewUrl ? 'external' : 'done')
      else setStep('private')
    }
  }

  // 4~5점 → 네이버 등 공개 리뷰로도 남기도록 유도
  if (step === 'external') {
    return (
      <div className="space-y-3">
        <p className="text-2xl">🙏</p>
        <p className="text-sm font-medium text-emerald-700">소중한 후기 감사합니다!</p>
        <p className="text-sm text-muted-foreground">
          같은 후기를 <b>{platformLabel}</b>에도 남겨주시면 저희에게 큰 힘이 돼요
        </p>
        {/* 어떤 청소를 어디서 받았는지 한 줄 들어간 후기가 압도적으로 강하다.
            검색·AI가 그 문장을 근거로 우리를 찾아낸다(실제로 리뷰 2개로 지도 2위에 오른 업체가 있다).
            부담이 되지 않게 '이렇게 적어달라'가 아니라 예시 한 줄만 보여준다. */}
        {keywordHint && (
          <div className="rounded-lg border bg-slate-50 px-3 py-2.5 text-left">
            <p className="text-xs text-muted-foreground">이런 한 줄이 들어가면 큰 도움이 돼요</p>
            <p className="text-sm text-foreground mt-1">“{keywordHint} 맡겼는데 만족했어요”</p>
          </div>
        )}
        {/* 위에서 저장한 작업 전·후 사진을 붙이도록 한 번 더 짚어준다 —
            사진이 붙은 후기가 훨씬 잘 읽히고 오래 남는다 */}
        <p className="text-xs text-muted-foreground">
          위의 <b className="font-semibold text-foreground">작업 전·후 사진</b>을 함께 올려주시면 더 좋아요
        </p>
        <Button
          className="w-full h-12"
          onClick={() => { window.open(reviewUrl!, '_blank'); setStep('done') }}
        >
          {platformLabel}에 후기 남기기 →
        </Button>
        <button
          type="button"
          onClick={() => setStep('done')}
          className="text-xs text-muted-foreground underline"
        >
          다음에 할게요
        </button>
      </div>
    )
  }

  // 1~3점 → 비공개로 사장님에게만 전달(공개 노출 방지)
  if (step === 'private') {
    return (
      <div className="space-y-3">
        <p className="text-2xl">🙇</p>
        <p className="text-sm font-medium">소중한 의견 감사합니다</p>
        <p className="text-sm text-muted-foreground">
          말씀해주신 내용을 사장님께 바로 전달했어요. 더 나은 서비스로 보답할게요.
        </p>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="space-y-3">
        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-xl">✓</span>
        </div>
        <p className="text-sm font-medium text-emerald-700">감사합니다 😊</p>
        {hasReward && (
          <p className="text-xs text-muted-foreground">업체에서 곧 혜택을 안내해 드릴게요</p>
        )}
      </div>
    )
  }

  // 기본: 별점 + 한 줄 후기 입력
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">서비스가 어떠셨나요?</p>

      {/* 별점 */}
      <div className="flex justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n}점`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className="p-0.5"
          >
            <Star
              className={`h-9 w-9 transition-colors ${
                n <= (hover || rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
              }`}
            />
          </button>
        ))}
      </div>

      {rating > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={rating >= 4 ? '어떤 점이 좋으셨나요? (선택)' : '아쉬운 점을 알려주시면 바로 개선할게요 (선택)'}
            rows={3}
            maxLength={500}
            className="w-full rounded-xl border p-3 text-sm outline-none focus:border-primary resize-none"
          />
          <Button className="w-full h-12" onClick={submit} disabled={isPending}>
            {isPending ? '보내는 중...' : '후기 보내기'}
          </Button>
        </>
      )}
    </div>
  )
}
