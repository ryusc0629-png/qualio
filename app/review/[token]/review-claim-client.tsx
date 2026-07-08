'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Star } from 'lucide-react'

interface ReviewClaimClientProps {
  claimId: string
  reviewUrl: string | null
  hasReward: boolean
}

export function ReviewClaimClient({ claimId, reviewUrl, hasReward }: ReviewClaimClientProps) {
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
          같은 후기를 <b>네이버</b>에도 남겨주시면 저희에게 큰 힘이 돼요
        </p>
        <Button
          className="w-full h-12"
          onClick={() => { window.open(reviewUrl!, '_blank'); setStep('done') }}
        >
          네이버에 후기 남기기 →
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
