'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { confirmBookingFromQuoteAction } from '@/lib/actions/quotes'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle } from 'lucide-react'

const TIER_OPTIONS = [
  { value: 'good',   label: '기본' },
  { value: 'better', label: '추천' },
  { value: 'best',   label: '프리미엄' },
]

interface ConfirmBookingButtonProps {
  quoteId:      string
  goodPrice:    number | null
  betterPrice:  number | null
  bestPrice:    number | null
  preferredDate?: string | null
}

export function ConfirmBookingButton({
  quoteId,
  goodPrice,
  betterPrice,
  bestPrice,
  preferredDate,
}: ConfirmBookingButtonProps) {
  const [open, setOpen]               = useState(false)
  const [tier, setTier]               = useState<'good' | 'better' | 'best'>('better')
  const [scheduledAt, setScheduledAt] = useState(preferredDate ?? '')
  const [finalPrice, setFinalPrice]   = useState<string>('')
  const [address, setAddress]         = useState('')

  // 플랜 선택 시 금액 자동 세팅
  const handleTierChange = (value: 'good' | 'better' | 'best') => {
    setTier(value)
    const price =
      value === 'good'   ? goodPrice :
      value === 'better' ? betterPrice :
      bestPrice
    if (price) setFinalPrice(String(price))
  }

  const { execute, isPending } = useAction(confirmBookingFromQuoteAction, {
    onSuccess: () => {
      toast.success('예약이 확정됐어요!')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    execute({
      quote_id:        quoteId,
      scheduled_at:    scheduledAt,
      selected_tier:   tier,
      final_price:     Number(finalPrice),
      service_address: address || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-40 transition-colors px-2 py-1 rounded-md hover:bg-primary/10 font-medium"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          예약 확정
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>예약 확정</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">

          {/* 날짜 */}
          <div className="space-y-1.5">
            <Label htmlFor="scheduledAt">청소 날짜 (필수)</Label>
            <Input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
          </div>

          {/* 플랜 선택 */}
          <div className="space-y-1.5">
            <Label>플랜 선택 (필수)</Label>
            <div className="grid grid-cols-3 gap-2">
              {TIER_OPTIONS.map((opt) => {
                const price =
                  opt.value === 'good'   ? goodPrice :
                  opt.value === 'better' ? betterPrice :
                  bestPrice
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleTierChange(opt.value as 'good' | 'better' | 'best')}
                    className={[
                      'rounded-lg border p-2 text-center transition-colors',
                      tier === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/40',
                    ].join(' ')}
                  >
                    <p className="text-xs font-semibold">{opt.label}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {price ? `${price.toLocaleString()}원` : '—'}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 최종 금액 */}
          <div className="space-y-1.5">
            <Label htmlFor="finalPrice">최종 금액 (필수)</Label>
            <div className="relative">
              <Input
                id="finalPrice"
                type="number"
                inputMode="numeric"
                placeholder="450000"
                value={finalPrice}
                onChange={(e) => setFinalPrice(e.target.value)}
                required
                className="pr-6"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">원</span>
            </div>
          </div>

          {/* 주소 */}
          <div className="space-y-1.5">
            <Label htmlFor="address">청소 주소</Label>
            <Input
              id="address"
              placeholder="예: 서울시 강남구 역삼동 123-45"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full h-12" disabled={isPending}>
            {isPending ? '저장 중...' : '예약 확정하기'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
