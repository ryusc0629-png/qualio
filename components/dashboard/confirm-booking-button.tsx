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
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { CheckCircle, Search } from 'lucide-react'
import { openAddressSearch } from '@/lib/address/postcode'

const TIER_OPTIONS = [
  { value: 'good',   label: '기본' },
  { value: 'better', label: '추천' },
  { value: 'best',   label: '프리미엄' },
]

interface ConfirmBookingButtonProps {
  quoteId:       string
  goodPrice:     number | null
  betterPrice:   number | null
  bestPrice:     number | null
  preferredDate?: string | null
}

export function ConfirmBookingButton({
  quoteId,
  goodPrice,
  betterPrice,
  bestPrice,
  preferredDate,
}: ConfirmBookingButtonProps) {
  const [open, setOpen]             = useState(false)
  const [tier, setTier]             = useState<'good' | 'better' | 'best'>('better')
  const [date, setDate]             = useState(preferredDate ?? '')
  const [time, setTime]             = useState('10:00')
  const [finalPrice, setFinalPrice] = useState<string>('')
  const [address, setAddress]       = useState('')
  const [addressDetail, setAddressDetail] = useState('')

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

  const doConfirm = () => {
    const fullAddress = addressDetail ? `${address} — ${addressDetail}` : address
    execute({
      quote_id:        quoteId,
      scheduled_at:    `${date}T${time}:00+09:00`,
      selected_tier:   tier,
      final_price:     Number(finalPrice),
      service_address: fullAddress || undefined,
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) { toast.error('날짜를 선택해주세요'); return }
    if (!address) {
      if (!window.confirm('주소가 입력되지 않았어요.\n나중에 따로 확인하실 건가요?')) return
    }
    doConfirm()
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

      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>예약 확정</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">

          {/* 날짜·시간 피커 */}
          <div className="space-y-1.5">
            <Label>
              청소 날짜·시간
              {date && (
                <span className="ml-2 text-primary font-semibold">
                  {date} {time}
                </span>
              )}
            </Label>
            <DateTimePicker
              date={date}
              time={time}
              onDateChange={setDate}
              onTimeChange={setTime}
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
                type="text"
                inputMode="numeric"
                placeholder="450,000"
                value={finalPrice ? Number(finalPrice).toLocaleString('ko-KR') : ''}
                onChange={(e) => setFinalPrice(e.target.value.replace(/[^0-9]/g, ''))}
                required
                className="pr-6"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">원</span>
            </div>
          </div>

          {/* 주소 */}
          <div className="space-y-1.5">
            <Label>청소 주소</Label>
            <button
              type="button"
              onClick={() => openAddressSearch((addr) => { setAddress(addr); setAddressDetail('') })}
              className="w-full h-10 rounded-md border border-input bg-background px-3 flex items-center justify-between text-sm text-left hover:bg-muted transition-colors"
            >
              <span className={address ? 'text-foreground' : 'text-muted-foreground'}>
                {address || '주소 검색하기'}
              </span>
              <Search className="h-4 w-4 text-primary shrink-0" />
            </button>
            {address && (
              <Input
                placeholder="상세 주소 입력 (예: 101동 1234호)"
                value={addressDetail}
                onChange={(e) => setAddressDetail(e.target.value)}
              />
            )}
          </div>

          <Button type="submit" className="w-full h-12" disabled={isPending}>
            {isPending ? '저장 중...' : '예약 확정하기'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
