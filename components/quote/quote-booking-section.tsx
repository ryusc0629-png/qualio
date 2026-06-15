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
import { Check, Plus, Lightbulb, Search } from 'lucide-react'

// 카카오(다음) 우편번호 API 타입 선언
declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: { address: string; buildingName: string; addressType: string; bname: string }) => void
        onclose?: () => void
      }) => { open: () => void }
    }
  }
}

// 카카오 주소 검색 팝업 실행
function openAddressSearch(onSelect: (address: string) => void) {
  const run = () => {
    new window.daum!.Postcode({
      oncomplete: (data) => {
        // 도로명 주소 + 건물명(있으면) 조합
        const extra = data.buildingName ? ` (${data.buildingName})` : ''
        onSelect(data.address + extra)
      },
    }).open()
  }

  if (window.daum?.Postcode) {
    run()
    return
  }

  // 스크립트 최초 로드 후 실행
  const script = document.createElement('script')
  script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
  script.onload = run
  document.head.appendChild(script)
}

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

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<BookingInput>({
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
      <div className="py-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">✅</span>
          </div>
          <p className="font-bold text-lg text-[#1A1A1A]">예약이 완료됐어요!</p>
          <p className="text-sm text-[#8D8D8D]">이제 퀄리오가 알아서 챙겨드릴게요.</p>
        </div>

        {/* 퀄리오 자동 처리 안내 */}
        <div className="space-y-2">
          {[
            { emoji: '📋', text: '예약 확정 알림톡을 곧 보내드려요' },
            { emoji: '📞', text: '청소 전날 해피콜 알림톡을 드려요' },
            { emoji: '📸', text: '작업 완료 후 사진 보고서를 전달해드려요' },
          ].map(({ emoji, text }) => (
            <div key={text} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
              <span className="text-lg shrink-0">{emoji}</span>
              <p className="text-sm text-[#4A4A4A] font-medium">{text}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const selectedTierData = tiers.find((t) => t.tier === selectedTier)

  return (
    <>
    <div className="space-y-4">
      {/* 플랜 카드 */}
      <div className="space-y-3">
        {tiers.map((tier, idx) => {
          const isSelected = selectedTier === tier.tier
          const aiItems = tierIncludes?.[tier.tier as keyof typeof tierIncludes]
          const upsellReason =
            tier.tier === 'better' ? tierReasons?.better :
            tier.tier === 'best'   ? tierReasons?.best   : undefined
          const delta = idx > 0 ? tier.price - tiers[idx - 1].price : 0

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
                  ? 'border-primary bg-primary/5'
                  : tier.highlight
                    ? 'border-orange-500 bg-orange-50/40 shadow-[0_4px_20px_rgba(234,88,12,0.12)]'
                    : 'border-border bg-white',
              ].join(' ')}
            >
              {/* 추천 뱃지 */}
              {tier.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[11px] font-bold px-4 py-1 rounded-full whitespace-nowrap shadow-sm">
                  ✨ 가장 많이 선택해요
                </div>
              )}

              {/* 플랜명 + 가격 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={[
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    isSelected ? 'border-primary bg-primary' : 'border-[#D4C9BE]',
                  ].join(' ')}>
                    {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </div>
                  <p className="font-extrabold text-base text-[#1A1A1A]">{tier.label}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-[#1A1A1A] tabular-nums">
                    {tier.price.toLocaleString('ko-KR')}원
                  </p>
                  {delta > 0 && (
                    <p className="text-xs text-primary font-semibold mt-0.5 tabular-nums">
                      기본보다 +{delta.toLocaleString('ko-KR')}원
                    </p>
                  )}
                </div>
              </div>

              {/* 포함 항목 — AI 생성 항목 */}
              {aiItems && (
                <div className="space-y-1.5 pl-7">
                  {aiItems.map((item, i) => {
                    const isAddon = item.startsWith('+')
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        {isAddon ? (
                          <Plus className="h-3 w-3 text-primary shrink-0" />
                        ) : (
                          <Check className="h-3 w-3 text-[#B0B0B0] shrink-0" />
                        )}
                        <span className={isAddon ? 'font-bold text-primary' : 'text-[#6B6B6B]'}>
                          {isAddon ? item.slice(1).trim() : item}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 업셀 이유 callout */}
              {upsellReason && (
                <div className="mt-3 ml-7 bg-primary/10 border border-primary/30 rounded-xl p-3 flex gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-primary/80 leading-relaxed break-keep">
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
        <div ref={formRef} className="rounded-2xl bg-slate-50 p-4 space-y-4">
          <p className="font-bold text-sm text-[#1A1A1A]">
            {selectedTierData.label} 플랜
            <span className="ml-2 text-primary tabular-nums">
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
                  className="h-11 bg-white border-border rounded-xl text-sm"
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
                  className="h-11 bg-white border-border rounded-xl text-sm"
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
              {/* 기본 주소 — 검색 버튼으로 실제 주소만 입력 가능 */}
              <button
                type="button"
                onClick={() => openAddressSearch((addr) => setValue('service_address', addr, { shouldValidate: true }))}
                className="w-full h-11 rounded-xl border border-border bg-white px-3 flex items-center justify-between text-sm text-left hover:bg-slate-50 transition-colors"
              >
                <span className={watch('service_address') ? 'text-foreground' : 'text-muted-foreground'}>
                  {watch('service_address') || '주소 검색하기'}
                </span>
                <Search className="h-4 w-4 text-primary shrink-0" />
              </button>
              {/* 상세 주소 — 동/호수 직접 입력 */}
              {watch('service_address') && (
                <Input
                  placeholder="상세 주소 입력 (예: 101동 1234호)"
                  className="h-11 bg-white border-border rounded-xl text-sm"
                  onChange={(e) => {
                    const base = watch('service_address').split(' — ')[0]
                    setValue('service_address', e.target.value ? `${base} — ${e.target.value}` : base, { shouldValidate: true })
                  }}
                />
              )}
              {errors.service_address && (
                <p className="text-xs text-red-500">{errors.service_address.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-14 rounded-2xl bg-primary text-white font-extrabold text-base disabled:opacity-60 active:scale-[0.98] transition-transform"
            >
              {isPending ? '예약 확정 중...' : '예약 확정하기'}
            </button>
          </form>
        </div>
      )}
    </div>

    {/* Sticky 하단 예약 바 — tier 선택 시 노출 */}
    {selectedTier && selectedTierData && !done && (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <div className="max-w-lg mx-auto px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-[#8D8D8D] font-medium">선택한 플랜</p>
            <p className="font-black text-[#1A1A1A] text-lg tabular-nums leading-tight">
              {selectedTierData.label}&nbsp;
              <span className="text-primary">
                {selectedTierData.price.toLocaleString('ko-KR')}원
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="shrink-0 bg-primary text-white font-extrabold px-6 h-12 rounded-2xl text-sm active:scale-[0.97] transition-transform"
          >
            예약하기 →
          </button>
        </div>
      </div>
    )}
    </>
  )
}
