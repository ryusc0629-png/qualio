'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBookingAction } from '@/lib/actions/quotes'
import { CheckCircle2, Star } from 'lucide-react'

const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

const bookingSchema = z.object({
  customer_name: z.string().min(2, '이름은 2자 이상 입력해주세요'),
  customer_phone: z
    .string()
    .min(1, '연락처를 입력해주세요')
    .transform((v) => v.replace(/-/g, ''))
    .refine((v) => phoneRegex.test(v), '올바른 전화번호를 입력해주세요 (예: 010-1234-5678)'),
  service_address: z.string().min(5, '주소를 입력해주세요'),
})

type BookingInput = z.infer<typeof bookingSchema>

interface Tier {
  tier: string
  label: string
  price: number
  highlight: boolean
}

interface QuoteBookingSectionProps {
  quoteId: string
  tiers: Tier[]
  defaultName?: string
  defaultPhone?: string
}

const TIER_FEATURES: Record<string, string[]> = {
  good:   ['기본 청소 항목 포함', '빠른 서비스'],
  better: ['기본 항목 + 세부 청소', '꼼꼼한 마무리', '가장 많이 선택'],
  best:   ['모든 항목 포함', '최고급 마감', '완벽 보장'],
}

export function QuoteBookingSection({ quoteId, tiers, defaultName, defaultPhone }: QuoteBookingSectionProps) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<BookingInput>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      customer_name:  defaultName  ?? '',
      customer_phone: defaultPhone ?? '',
    },
  })

  const { execute, isPending } = useAction(createBookingAction, {
    onSuccess: () => setDone(true),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  if (done) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold">예약이 완료됐습니다!</h3>
        <p className="text-muted-foreground text-sm">담당자가 예약일 전에 연락드리겠습니다.</p>
      </div>
    )
  }

  const selectedTierData = tiers.find((t) => t.tier === selectedTier)

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">플랜을 선택해주세요</h2>
        <p className="text-muted-foreground text-sm mt-1">선택 후 바로 예약 확정까지 진행됩니다</p>
      </div>

      {/* 플랜 카드 3개 */}
      <div className="space-y-3">
        {tiers.map((tier) => {
          const isSelected = selectedTier === tier.tier
          const features = TIER_FEATURES[tier.tier] ?? []

          return (
            <button
              key={tier.tier}
              type="button"
              onClick={() => setSelectedTier(tier.tier)}
              className={[
                'relative w-full rounded-2xl border-2 p-5 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-md'
                  : tier.highlight
                    ? 'border-orange-300 bg-orange-50/50 hover:border-orange-400'
                    : 'border-border bg-white hover:border-primary/50',
              ].join(' ')}
            >
              {tier.highlight && !isSelected && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-semibold px-3 py-0.5 rounded-full flex items-center gap-1">
                  <Star className="h-3 w-3 fill-white" /> 가장 많이 선택
                </span>
              )}
              {isSelected && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded-full">
                  ✓ 선택됨
                </span>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-base">{tier.label}</p>
                  <ul className="mt-2 space-y-1">
                    {features.map((f, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="text-primary">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-2xl font-bold tabular-nums">
                    {tier.price.toLocaleString('ko-KR')}
                  </p>
                  <p className="text-xs text-muted-foreground">원</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* 예약 폼 — 플랜 선택 후 표시 */}
      {selectedTier && selectedTierData && (
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-6 space-y-5">
          <div>
            <p className="font-semibold text-sm">
              {selectedTierData.label} 플랜 ·{' '}
              <span className="tabular-nums">{selectedTierData.price.toLocaleString('ko-KR')}원</span> 예약
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">예약자 정보를 입력해주세요</p>
          </div>

          <form
            onSubmit={handleSubmit((data) =>
              execute({
                quote_id:      quoteId,
                selected_tier: selectedTier as 'good' | 'better' | 'best',
                customer_name:  data.customer_name,
                customer_phone: data.customer_phone,
                service_address: data.service_address,
              })
            )}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs">이름 (필수)</Label>
                <Input id="name" placeholder="홍길동" className="h-11" {...register('customer_name')} />
                {errors.customer_name && (
                  <p className="text-xs text-destructive">{errors.customer_name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs">연락처 (필수)</Label>
                <Input id="phone" placeholder="010-1234-5678" inputMode="tel" className="h-11" {...register('customer_phone')} />
                {errors.customer_phone && (
                  <p className="text-xs text-destructive">{errors.customer_phone.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="address" className="text-xs">서비스 주소 (필수)</Label>
              <Input id="address" placeholder="서울시 강남구 역삼동 123-45" className="h-11" {...register('service_address')} />
              {errors.service_address && (
                <p className="text-xs text-destructive">{errors.service_address.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isPending}>
              {isPending ? '예약 확정 중...' : '지금 예약 확정하기 →'}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
