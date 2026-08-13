'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addBookingAction } from '@/lib/actions/bookings'
import { Plus, X, Check, CalendarPlus } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useAutoFocusRef } from '@/lib/hooks/use-auto-focus'
import { AddressField } from '@/components/ui/address-field'

const schema = z.object({
  cleaning_type: z.string().min(1, '서비스명을 입력해주세요'),
  scheduled_at: z.string().min(1, '날짜·시간을 선택해주세요'),
  final_price: z.string().min(1, '금액을 입력해주세요'),
  service_address: z.string().min(5, '주소를 입력해주세요'),
  memo: z.string().max(500).optional(),
})

type FormInput = z.infer<typeof schema>

const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')
const formatThousands = (v: string) => {
  const d = digitsOnly(v)
  return d ? Number(d).toLocaleString('ko-KR') : ''
}

interface Props {
  customer: { name: string; phone: string | null; address: string | null }
  // 견적서 등에서 넘어올 때 서비스명·금액을 미리 채워 원터치로 일정만 잡게 함
  // vatRemoved: 견적서 부가세(10%)를 뺀 공급가액을 넣었음을 안내(견적이 부가세 포함일 때)
  prefill?: { cleaning_type?: string; final_price?: number; vatRemoved?: boolean }
  // 트리거 버튼 문구/모양 (기본: '예약 등록'). 견적서 카드에선 '일정 잡기' 등으로 사용
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
  triggerClassName?: string
  triggerIcon?: 'plus' | 'calendar'
}

// 초기 폼값 — prefill(서비스명·금액)과 고객 주소를 반영
function buildDefaults(customer: Props['customer'], prefill?: Props['prefill']): Partial<FormInput> {
  return {
    service_address: customer.address ?? '',
    cleaning_type: prefill?.cleaning_type ?? '',
    final_price: prefill?.final_price ? String(prefill.final_price) : '',
  }
}

// 고객 상세에서 그 고객으로 바로 예약을 등록 (클레임 등록과 동일한 흐름)
export function AddBookingButton({
  customer,
  prefill,
  triggerLabel = '예약 등록',
  triggerVariant = 'default',
  triggerClassName,
  triggerIcon = 'plus',
}: Props) {
  const [open, setOpen] = useState(false)
  const focusRef = useAutoFocusRef<HTMLDivElement>()
  const router = useRouter()

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(customer, prefill),
  })

  const { execute, isPending } = useAction(addBookingAction, {
    onSuccess: () => {
      toast.success('예약을 등록했어요')
      reset(buildDefaults(customer, prefill))
      setOpen(false)
      router.refresh() // 서비스 이력에 즉시 반영
    },
    onError: ({ error }) => toast.error(error.serverError ?? '예약 등록에 실패했어요. 다시 시도해주세요'),
  })

  function onSubmit(data: FormInput) {
    if (!customer.phone) { toast.error('이 고객은 연락처가 없어 예약을 등록할 수 없어요'); return }
    execute({
      customer_name: customer.name,
      customer_phone: customer.phone,
      service_address: data.service_address,
      cleaning_type: data.cleaning_type,
      scheduled_at: data.scheduled_at,
      final_price: Number(digitsOnly(data.final_price)),
      memo: data.memo,
    })
  }

  // 연락처가 없으면 예약 등록 불가 (전화번호로 연결되는 구조)
  if (!customer.phone) return null

  if (!open) {
    const TriggerIcon = triggerIcon === 'calendar' ? CalendarPlus : Plus
    return (
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant={triggerVariant}
        className={triggerClassName ?? 'h-9'}
      >
        <TriggerIcon className="h-4 w-4 mr-1" />
        {triggerLabel}
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <ScrollLock />
      <div
        ref={focusRef}
        tabIndex={-1}
        className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto overscroll-contain outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">예약 등록</h2>
          <button onClick={() => setOpen(false)} aria-label="닫기">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* 대상 고객 (고정) */}
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{customer.name}</p>
            <p className="text-xs text-muted-foreground">{customer.phone}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* 서비스명 */}
          <div className="space-y-1">
            <Label htmlFor="cleaning_type">어떤 서비스인가요? (필수)</Label>
            <Input id="cleaning_type" placeholder="입주 청소, 정기 청소 등" {...register('cleaning_type')} />
            {errors.cleaning_type && <p className="text-xs text-destructive">{errors.cleaning_type.message}</p>}
          </div>

          {/* 날짜·시간 */}
          <div className="space-y-1">
            <Label htmlFor="scheduled_at">날짜·시간 (필수)</Label>
            <Input id="scheduled_at" type="datetime-local" {...register('scheduled_at')} />
            {errors.scheduled_at && <p className="text-xs text-destructive">{errors.scheduled_at.message}</p>}
          </div>

          {/* 금액 — 매출은 부가세 별도(공급가액) 기준으로 기록 */}
          <div className="space-y-1">
            <Label htmlFor="final_price">금액 (부가세 별도)</Label>
            <Input
              id="final_price"
              inputMode="numeric"
              placeholder="345,000"
              value={formatThousands(watch('final_price') ?? '')}
              onChange={(e) => setValue('final_price', digitsOnly(e.target.value), { shouldValidate: true })}
            />
            {/* 부가세 별도 안내 — 견적서에서 부가세를 뺀 금액을 넣었으면 그 사실도 함께 알려줌 */}
            <p className="text-xs text-muted-foreground">
              {prefill?.vatRemoved
                ? '견적서 부가세(10%)를 뺀 금액이에요 · 매출은 부가세 별도로 기록돼요'
                : '부가세 별도(공급가액) 금액을 넣어주세요 · 세금계산서엔 10%가 더해져요'}
            </p>
            {errors.final_price && <p className="text-xs text-destructive">{errors.final_price.message}</p>}
          </div>

          {/* 주소 */}
          <div className="space-y-1">
            <AddressField
              id="service_address"
              label="작업 주소 (필수)"
              value={watch('service_address') ?? ''}
              onChange={(next) => setValue('service_address', next, { shouldValidate: true })}
            />
            {errors.service_address && <p className="text-xs text-destructive">{errors.service_address.message}</p>}
          </div>

          {/* 메모 */}
          <div className="space-y-1">
            <Label htmlFor="memo">메모</Label>
            <textarea
              id="memo"
              {...register('memo')}
              placeholder="현장 특이사항, 요청사항 등"
              className="w-full min-h-16 rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full h-12">
            {isPending ? '등록 중...' : '예약 등록하기'}
          </Button>
        </form>
      </div>
    </div>
  )
}
