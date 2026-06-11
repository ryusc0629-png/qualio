'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBookingAction } from '@/lib/actions/quotes'
import { Check, Plus, Lightbulb } from 'lucide-react'

const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

const bookingSchema = z.object({
  customer_name: z.string().min(2, '이름은 2자 이상 입력해주세요'),
  customer_phone: z
    .string()
    .min(1, '연락처를 입력해주세요')
    .transform((v) => v.replace(/-/g, ''))
    .refine((v) => phoneRegex.test(v), '올바른 전화번호를 입력해주세요'),
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
  tierReasons?: {
    better: string
    best: string
  }
  tierIncludes?: {
    good: string[]
    better: string[]
    best: string[]
  }
}

const TIER_CONTENT: Record<string, {
  base: string[]
  addons: { name: string; detail: string }[]
}> = {
  good: {
    base: [
      '주방 전체 (싱크대·타일·레인지후드)',
      '욕실 전체 (줄눈·변기·세면대)',
      '전 실 바닥·창틀·문틀·벽면',
      '베란다·다용도실',
    ],
    addons: [],
  },
  better: {
    base: ['기본 청소 전 항목 완전 포함'],
    addons: [
      { name: '새집증후군 케어', detail: 'VOC·포름알데히드 전문 제거' },
    ],
  },
  best: {
    base: ['기본 청소 전 항목 완전 포함'],
    addons: [
      { name: '새집증후군 케어', detail: 'VOC·포름알데히드 전문 제거' },
      { name: '상판 연마 처리', detail: '주방·욕실 상판 전용 연마' },
      { name: '마루 코팅 처리', detail: '전 실 마루 보호 코팅' },
    ],
  },
}

export function QuoteBookingSection({
  quoteId,
  tiers,
  defaultName,
  defaultPhone,
  tierReasons,
  tierIncludes,
}: QuoteBookingSectionProps) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

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
      <div className="text-center py-10 space-y-3">
        <div className="w-16 h-16 bg-[#FFF3E8] rounded-full flex items-center justify-center mx-auto">
          <span className="text-3xl">🎉</span>
        </div>
        <p className="font-bold text-lg text-[#1A1A1A]">예약이 완료됐어요!</p>
        <p className="text-sm text-[#8D8D8D]">담당자가 예약일 전에 연락드리겠습니다.</p>
      </div>
    )
  }

  const selectedTierData = tiers.find((t) => t.tier === selectedTier)

  return (
    <>
    <div className="space-y-4">
      {/* 플랜 카드 */}
      <div className="space-y-3">
        {tiers.map((tier) => {
          const isSelected = selectedTier === tier.tier
          // AI 생성 항목 우선, 없으면 정적 fallback
          const aiItems = tierIncludes?.[tier.tier as keyof typeof tierIncludes]
          const fallback = TIER_CONTENT[tier.tier]
          const upsellReason =
            tier.tier === 'better' ? tierReasons?.better :
            tier.tier === 'best'   ? tierReasons?.best   : undefined

          return (
            <button
              key={tier.tier}
              type="button"
              onClick={() => {
                setSelectedTier(tier.tier)
                setTimeout(() => {
                  formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 80)
              }}
              className={[
                'relative w-full rounded-2xl border-2 text-left transition-all p-4',
                isSelected
                  ? 'border-[#FF7D00] bg-[#FFF8F3]'
                  : tier.highlight
                    ? 'border-[#FFD4A8] bg-white'
                    : 'border-[#F0EBE3] bg-white',
              ].join(' ')}
            >
              {/* 추천 뱃지 */}
              {tier.highlight && (
                <div className="absolute -top-3 left-4 bg-[#FF7D00] text-white text-[11px] font-bold px-3 py-0.5 rounded-full">
                  가장 많이 선택해요
                </div>
              )}

              {/* 플랜명 + 가격 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={[
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    isSelected ? 'border-[#FF7D00] bg-[#FF7D00]' : 'border-[#D4C9BE]',
                  ].join(' ')}>
                    {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </div>
                  <p className="font-extrabold text-base text-[#1A1A1A]">{tier.label}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-[#1A1A1A] tabular-nums">
                    {tier.price.toLocaleString('ko-KR')}원
                  </p>
                </div>
              </div>

              {/* 포함 항목 — AI 생성 우선, fallback은 정적 목록 */}
              {aiItems ? (
                <div className="space-y-1.5 pl-7">
                  {aiItems.map((item, i) => {
                    const isAddon = item.startsWith('+')
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        {isAddon ? (
                          <Plus className="h-3 w-3 text-[#FF7D00] shrink-0" />
                        ) : (
                          <Check className="h-3 w-3 text-[#B0B0B0] shrink-0" />
                        )}
                        <span className={isAddon ? 'font-bold text-[#FF7D00]' : 'text-[#6B6B6B]'}>
                          {isAddon ? item.slice(1).trim() : item}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : fallback ? (
                <div className="space-y-1.5 pl-7">
                  {fallback.base.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-[#6B6B6B]">
                      <Check className="h-3 w-3 text-[#B0B0B0] shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                  {fallback.addons.map((addon, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Plus className="h-3 w-3 text-[#FF7D00] shrink-0" />
                      <span className="text-xs font-bold text-[#FF7D00]">{addon.name}</span>
                      <span className="text-xs text-[#8D8D8D]">({addon.detail})</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* 업셀 이유 callout */}
              {upsellReason && (
                <div className="mt-3 ml-7 bg-[#FFF3E8] border border-[#FFD4A8] rounded-xl p-3 flex gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-[#FF7D00] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#995200] leading-relaxed break-keep">
                    {upsellReason}
                  </p>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* 예약 폼 */}
      {selectedTier && selectedTierData && (
        <div ref={formRef} className="rounded-2xl bg-[#F5F0EB] p-4 space-y-4">
          <p className="font-bold text-sm text-[#1A1A1A]">
            {selectedTierData.label} 플랜
            <span className="ml-2 text-[#FF7D00] tabular-nums">
              {selectedTierData.price.toLocaleString('ko-KR')}원
            </span>
          </p>

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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-[#6B6B6B]">이름 (필수)</Label>
                <Input
                  placeholder="홍길동"
                  className="h-11 bg-white border-[#F0EBE3] rounded-xl text-sm"
                  {...register('customer_name')}
                />
                {errors.customer_name && (
                  <p className="text-xs text-red-500">{errors.customer_name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#6B6B6B]">연락처 (필수)</Label>
                <Input
                  placeholder="01012345678"
                  inputMode="numeric"
                  className="h-11 bg-white border-[#F0EBE3] rounded-xl text-sm"
                  {...register('customer_phone')}
                  onChange={(e) => {
                    const numOnly = e.target.value.replace(/\D/g, '')
                    e.target.value = numOnly
                  }}
                />
                {errors.customer_phone && (
                  <p className="text-xs text-red-500">{errors.customer_phone.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-[#6B6B6B]">서비스 주소 (필수)</Label>
              <Input
                placeholder="서울시 강남구 역삼동 123-45"
                className="h-11 bg-white border-[#F0EBE3] rounded-xl text-sm"
                {...register('service_address')}
              />
              {errors.service_address && (
                <p className="text-xs text-red-500">{errors.service_address.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-14 rounded-2xl bg-[#FF7D00] text-white font-extrabold text-base disabled:opacity-60 active:scale-[0.98] transition-transform"
            >
              {isPending ? '예약 확정 중...' : '예약 확정하기'}
            </button>
          </form>
        </div>
      )}
    </div>

    {/* Sticky 하단 예약 바 — tier 선택 시 노출 */}
    {selectedTier && selectedTierData && !done && (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#F0EBE3] shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <div className="max-w-lg mx-auto px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-[#8D8D8D] font-medium">선택한 플랜</p>
            <p className="font-black text-[#1A1A1A] text-lg tabular-nums leading-tight">
              {selectedTierData.label}&nbsp;
              <span className="text-[#FF7D00]">
                {selectedTierData.price.toLocaleString('ko-KR')}원
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="shrink-0 bg-[#FF7D00] text-white font-extrabold px-6 h-12 rounded-2xl text-sm active:scale-[0.97] transition-transform"
          >
            예약하기 →
          </button>
        </div>
      </div>
    )}
    </>
  )
}
