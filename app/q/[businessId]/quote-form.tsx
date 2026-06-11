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
import { calculateAndCreateQuoteAction, createBookingAction } from '@/lib/actions/quotes'

// Step 1: 서비스 정보 스키마 (space_size는 string으로 받아 수동 변환)
const step1Schema = z.object({
  service_id: z.string().min(1, '서비스를 선택해주세요'),
  space_size: z.string().optional(),
  preferred_date: z.string().optional(),
  extra_notes: z.string().max(500).optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
})

// Step 2: 예약 확정 스키마
const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/
const step2Schema = z.object({
  customer_name: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  customer_phone: z
    .string()
    .min(1, '연락처를 입력해주세요')
    .transform((val) => val.replace(/-/g, ''))
    .refine((val) => phoneRegex.test(val), '올바른 전화번호 형식이 아닙니다'),
  service_address: z.string().min(5, '주소를 입력해주세요'),
})

type Step1Input = z.infer<typeof step1Schema>
type Step2Input = z.infer<typeof step2Schema>

interface TierResult {
  tier: string
  label: string
  price: number
  highlight: boolean
  descriptions: string[]
}

interface ServiceItem {
  id: string
  name: string
  base_price: number
  unit: string
}

interface QuoteFormProps {
  businessId: string
  services: ServiceItem[]
}

export function QuoteForm({ businessId, services }: QuoteFormProps) {
  const [step, setStep] = useState<'form' | 'price' | 'done'>('form')
  const [quoteId, setQuoteId] = useState<string | null>(null)
  const [tiers, setTiers] = useState<TierResult[]>([])
  const [selectedTier, setSelectedTier] = useState<string | null>(null)

  // 선택된 서비스의 단위 확인 (평당 여부)
  const [selectedServiceId, setSelectedServiceId] = useState<string>('')
  const selectedService = services.find((s) => s.id === selectedServiceId)
  const isPricePer = selectedService?.unit === '평당'

  // Step 1 폼
  const form1 = useForm<Step1Input>({
    resolver: zodResolver(step1Schema),
  })

  // Step 2 폼
  const form2 = useForm<Step2Input>({
    resolver: zodResolver(step2Schema),
  })

  // Step 1 액션: 가격 계산 + 견적 생성
  const { execute: executeCalculate, isPending: isCalculating } = useAction(calculateAndCreateQuoteAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      setQuoteId(data.quoteId)
      setTiers(data.tiers)
      setStep('price')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '견적 계산에 실패했습니다'),
  })

  // Step 2 액션: 예약 확정
  const { execute: executeBooking, isPending: isBooking } = useAction(createBookingAction, {
    onSuccess: () => setStep('done'),
    onError: ({ error }) => toast.error(error.serverError ?? '예약에 실패했습니다'),
  })

  const onStep1Submit = (data: Step1Input) => {
    const spaceSize = data.space_size ? Number(data.space_size) : undefined
    if (isPricePer && (!spaceSize || spaceSize < 1)) {
      form1.setError('space_size', { message: '평당 서비스는 평수를 입력해주세요' })
      return
    }
    // Step 1 연락처 → Step 2 폼 미리 채우기
    if (data.customer_name) form2.setValue('customer_name', data.customer_name)
    if (data.customer_phone) form2.setValue('customer_phone', data.customer_phone)

    executeCalculate({
      business_id:    businessId,
      service_id:     data.service_id,
      space_size:     spaceSize,
      preferred_date: data.preferred_date || undefined,
      extra_notes:    data.extra_notes || undefined,
      customer_name:  data.customer_name || undefined,
      customer_phone: data.customer_phone || undefined,
    })
  }

  const onStep2Submit = (data: Step2Input) => {
    if (!quoteId || !selectedTier) {
      toast.error('플랜을 선택해주세요')
      return
    }
    executeBooking({
      quote_id: quoteId,
      selected_tier: selectedTier,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      service_address: data.service_address,
    })
  }

  // 완료 화면
  if (step === 'done') {
    return (
      <div className="text-center py-10 space-y-3">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-bold">예약이 완료됐습니다!</h2>
        <p className="text-muted-foreground text-sm">
          담당자가 예약일 전에 연락드리겠습니다.
        </p>
      </div>
    )
  }

  // 가격 확인 + 예약 확정 화면
  if (step === 'price') {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="font-semibold text-base">견적을 선택해주세요</h2>
          <p className="text-xs text-muted-foreground">마음에 드는 플랜을 선택하시면 예약으로 이어집니다</p>
        </div>

        {/* 가격 카드 3개 */}
        <div className="flex flex-col gap-3">
          {tiers.map((tier) => (
            <button
              key={tier.tier}
              type="button"
              onClick={() => setSelectedTier(tier.tier)}
              className={[
                'relative rounded-lg border-2 p-4 text-left transition-colors',
                selectedTier === tier.tier
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50',
              ].join(' ')}
            >
              {tier.highlight && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] text-primary-foreground font-medium">
                  추천
                </span>
              )}
              {/* 플랜명 + 가격 */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{tier.label}</span>
                <span className="font-bold text-base">{tier.price.toLocaleString()}원</span>
              </div>
              {/* AI 생성 설명 bullet */}
              {tier.descriptions.length > 0 && (
                <ul className="space-y-1 border-t border-border/50 pt-2">
                  {tier.descriptions.map((desc, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="text-primary shrink-0 mt-0.5">✓</span>
                      <span>{desc}</span>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          ))}
        </div>

        {/* 예약 확정 폼 (플랜 선택 후 노출) */}
        {selectedTier && (
          <form onSubmit={form2.handleSubmit(onStep2Submit)} className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium">예약자 정보를 입력해주세요</p>

            <div className="space-y-1">
              <Label htmlFor="customer_name">이름 *</Label>
              <Input id="customer_name" placeholder="홍길동" {...form2.register('customer_name')} />
              {form2.formState.errors.customer_name && (
                <p className="text-xs text-destructive">{form2.formState.errors.customer_name.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="customer_phone">연락처 *</Label>
              <Input id="customer_phone" type="tel" placeholder="010-1234-5678" {...form2.register('customer_phone')} />
              {form2.formState.errors.customer_phone && (
                <p className="text-xs text-destructive">{form2.formState.errors.customer_phone.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="service_address">서비스 주소 *</Label>
              <Input id="service_address" placeholder="서울시 강남구 테헤란로 123" {...form2.register('service_address')} />
              {form2.formState.errors.service_address && (
                <p className="text-xs text-destructive">{form2.formState.errors.service_address.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isBooking}>
              {isBooking ? '예약 중...' : '예약 확정하기'}
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={() => { setStep('form'); setSelectedTier(null) }}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← 서비스 다시 선택하기
        </button>
      </div>
    )
  }

  // Step 1: 서비스 정보 입력 화면
  return (
    <form onSubmit={form1.handleSubmit(onStep1Submit)} className="space-y-5">
      {/* 서비스 선택 */}
      <div className="space-y-1">
        <Label htmlFor="service_id">서비스 선택 *</Label>
        {services.length > 0 ? (
          <select
            id="service_id"
            {...form1.register('service_id')}
            onChange={(e) => {
              form1.setValue('service_id', e.target.value)
              setSelectedServiceId(e.target.value)
            }}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            defaultValue=""
          >
            <option value="" disabled>서비스를 선택해주세요</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-muted-foreground">등록된 서비스가 없습니다</p>
        )}
        {form1.formState.errors.service_id && (
          <p className="text-xs text-destructive">{form1.formState.errors.service_id.message}</p>
        )}
      </div>

      {/* 평수 (평당 서비스 선택 시 필수) */}
      <div className="space-y-1">
        <Label htmlFor="space_size">
          평수{isPricePer ? ' *' : ' (선택)'}
          {isPricePer && <span className="ml-1 text-xs text-muted-foreground font-normal">— 가격 계산에 사용됩니다</span>}
        </Label>
        <Input
          id="space_size"
          type="number"
          placeholder="예) 25"
          {...form1.register('space_size')}
        />
        {form1.formState.errors.space_size && (
          <p className="text-xs text-destructive">{form1.formState.errors.space_size.message}</p>
        )}
      </div>

      {/* 희망 날짜 */}
      <div className="space-y-1">
        <Label htmlFor="preferred_date">희망 날짜 (선택)</Label>
        <Input id="preferred_date" type="date" {...form1.register('preferred_date')} />
      </div>

      {/* 메모 */}
      <div className="space-y-1">
        <Label htmlFor="extra_notes">추가 요청사항 (선택)</Label>
        <textarea
          id="extra_notes"
          {...form1.register('extra_notes')}
          placeholder="특이사항이나 요청사항을 입력해주세요"
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 연락처 (선택) — 카카오로 견적 받기 */}
      <div className="rounded-lg border border-dashed p-4 space-y-3 bg-yellow-50/50">
        <p className="text-xs font-medium text-yellow-800">
          📱 연락처를 남기시면 카카오톡으로 견적을 보내드려요
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="customer_name" className="text-xs">이름</Label>
            <Input
              id="customer_name"
              placeholder="홍길동"
              {...form1.register('customer_name')}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="customer_phone" className="text-xs">연락처</Label>
            <Input
              id="customer_phone"
              placeholder="010-1234-5678"
              inputMode="tel"
              {...form1.register('customer_phone')}
              className="h-9 text-sm"
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isCalculating || services.length === 0}>
        {isCalculating ? '계산 중...' : '가격 확인하기'}
      </Button>
    </form>
  )
}
