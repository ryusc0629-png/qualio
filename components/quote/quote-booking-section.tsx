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
import { CheckCircle2, Check, Plus } from 'lucide-react'

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

// 기본 = 전문 청소 전 항목, 추천/프리미엄 = 기본 + 특수 추가 서비스
const TIER_CONTENT: Record<string, {
  tag: string
  tagColor: string
  base: string[]
  addons: string[]
}> = {
  good: {
    tag: '전문 청소 전 항목 포함',
    tagColor: 'bg-zinc-100 text-zinc-700',
    base: [
      '주방 전체 (싱크대·타일·레인지후드)',
      '욕실 전체 (줄눈·변기·세면대)',
      '전 실 바닥·창틀·문틀·벽면',
      '베란다·다용도실',
    ],
    addons: [],
  },
  better: {
    tag: '기본 + 특수 케어',
    tagColor: 'bg-orange-100 text-orange-700',
    base: ['기본 청소 전 항목 완전 포함'],
    addons: ['새집증후군 케어 (VOC·포름알데히드 제거)'],
  },
  best: {
    tag: '기본 + 프리미엄 마감',
    tagColor: 'bg-violet-100 text-violet-700',
    base: ['기본 청소 전 항목 완전 포함'],
    addons: [
      '새집증후군 케어 (VOC·포름알데히드 제거)',
      '상판 연마 처리',
      '마루 코팅 처리',
    ],
  },
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
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">플랜 선택</h2>
        <p className="text-sm text-muted-foreground mt-0.5">모든 플랜은 동일한 최고 품질로 시공됩니다</p>
      </div>

      {/* 플랜 카드 */}
      <div className="space-y-3">
        {tiers.map((tier) => {
          const isSelected = selectedTier === tier.tier
          const content = TIER_CONTENT[tier.tier]

          return (
            <button
              key={tier.tier}
              type="button"
              onClick={() => setSelectedTier(tier.tier)}
              className={[
                'relative w-full rounded-2xl border-2 text-left transition-all overflow-hidden',
                isSelected
                  ? 'border-zinc-900 shadow-lg'
                  : tier.highlight
                    ? 'border-orange-300 hover:border-orange-400'
                    : 'border-zinc-200 hover:border-zinc-400',
              ].join(' ')}
            >
              {/* 추천 라벨 */}
              {tier.highlight && (
                <div className="bg-orange-500 text-white text-xs font-bold px-4 py-1.5 text-center tracking-wide">
                  ★ 가장 많이 선택하는 플랜
                </div>
              )}

              <div className="p-5">
                {/* 플랜명 + 가격 */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-extrabold text-lg">{tier.label}</p>
                    {content && (
                      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 ${content.tagColor}`}>
                        {content.tag}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black tabular-nums">
                      {tier.price.toLocaleString('ko-KR')}
                    </p>
                    <p className="text-xs text-muted-foreground">원</p>
                  </div>
                </div>

                {/* 포함 항목 */}
                {content && (
                  <div className="space-y-1.5">
                    {content.base.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                        <span className="text-zinc-600">{item}</span>
                      </div>
                    ))}
                    {content.addons.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Plus className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                        <span className="font-semibold text-zinc-800">{item}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 선택 인디케이터 */}
                {isSelected && (
                  <div className="mt-3 pt-3 border-t border-zinc-200 flex items-center gap-2 text-xs font-semibold text-zinc-900">
                    <Check className="h-3.5 w-3.5" />
                    선택됨 — 아래에서 예약 정보를 입력하세요
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* 예약 폼 */}
      {selectedTier && selectedTierData && (
        <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-5 space-y-4 mt-2">
          <div>
            <p className="font-bold text-sm">
              {selectedTierData.label} 플랜 예약
              <span className="ml-2 text-zinc-500 font-normal tabular-nums">
                {selectedTierData.price.toLocaleString('ko-KR')}원
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">예약자 정보를 입력해주세요</p>
          </div>

          <form
            onSubmit={handleSubmit((data) =>
              execute({
                quote_id:        quoteId,
                selected_tier:   selectedTier as 'good' | 'better' | 'best',
                customer_name:   data.customer_name,
                customer_phone:  data.customer_phone,
                service_address: data.service_address,
              })
            )}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">이름 (필수)</Label>
                <Input placeholder="홍길동" className="h-11 bg-white" {...register('customer_name')} />
                {errors.customer_name && (
                  <p className="text-xs text-destructive">{errors.customer_name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">연락처 (필수)</Label>
                <Input
                  placeholder="01012345678"
                  inputMode="numeric"
                  className="h-11 bg-white"
                  {...register('customer_phone')}
                  onChange={(e) => {
                    const numOnly = e.target.value.replace(/\D/g, '')
                    e.target.value = numOnly
                  }}
                />
                {errors.customer_phone && (
                  <p className="text-xs text-destructive">{errors.customer_phone.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">서비스 주소 (필수)</Label>
              <Input placeholder="서울시 강남구 역삼동 123-45" className="h-11 bg-white" {...register('service_address')} />
              {errors.service_address && (
                <p className="text-xs text-destructive">{errors.service_address.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl"
              disabled={isPending}
            >
              {isPending ? '예약 확정 중...' : '예약 확정하기 →'}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
