'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ReviewClaimClientProps {
  claimId: string
  reviewUrl: string | null
  hasReward: boolean
}

export function ReviewClaimClient({ claimId, reviewUrl, hasReward }: ReviewClaimClientProps) {
  const [step, setStep] = useState<'initial' | 'confirming' | 'done'>('initial')
  const [isPending, setIsPending] = useState(false)

  const handleClaim = async () => {
    setIsPending(true)
    try {
      await fetch('/api/review/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId }),
      })
    } catch {
      // 실패해도 UX는 진행
    } finally {
      setIsPending(false)
      setStep('done')
      // 후기 사이트로 이동
      if (reviewUrl) {
        setTimeout(() => window.open(reviewUrl, '_blank'), 500)
      }
    }
  }

  if (step === 'done') {
    return (
      <div className="space-y-3">
        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-xl">✓</span>
        </div>
        <p className="text-sm font-medium text-emerald-700">인증 완료!</p>
        {hasReward && (
          <p className="text-xs text-muted-foreground">업체에서 곧 혜택을 안내해 드릴게요</p>
        )}
        {reviewUrl && (
          <p className="text-xs text-muted-foreground">후기 페이지가 열리지 않으면{' '}
            <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary">
              여기를 눌러주세요
            </a>
          </p>
        )}
      </div>
    )
  }

  if (step === 'confirming') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">후기를 남기셨나요?</p>
        <div className="flex gap-2">
          <Button
            className="flex-1 h-12"
            onClick={handleClaim}
            disabled={isPending}
          >
            {isPending ? '처리 중...' : '네, 남겼어요!'}
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12"
            onClick={() => setStep('initial')}
          >
            아직이요
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        후기 한 줄이 저희에게 큰 힘이 됩니다 🙏
      </p>
      {reviewUrl ? (
        <Button
          className="w-full h-12"
          onClick={() => {
            window.open(reviewUrl, '_blank')
            setTimeout(() => setStep('confirming'), 1500)
          }}
        >
          후기 남기러 가기 →
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">업체에서 후기 링크를 아직 등록하지 않았어요</p>
      )}
    </div>
  )
}
