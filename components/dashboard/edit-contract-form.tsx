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
import { updateContractAction } from '@/lib/actions/contracts'
import { FrequencyPicker } from '@/components/dashboard/frequency-picker'
import { Pencil, X, TrendingUp } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useAutoFocusRef } from '@/lib/hooks/use-auto-focus'

const schema = z.object({
  service_type: z.string().min(1, '계약 이름을 입력해주세요'),
  frequency: z.string().min(1, '방문 주기를 선택해주세요'),
  contract_price: z.string().min(1, '월 금액을 입력해주세요'),
  price_effective_from: z.string().optional(),
  price_change_note: z.string().optional(),
  start_date: z.string().min(1, '시작일을 입력해주세요'),
  end_date: z.string().optional(),
  notes: z.string().optional(),
})

type FormInput = z.infer<typeof schema>

export interface EditContractTarget {
  id: string
  service_type: string | null
  frequency: string
  contract_price: number
  start_date: string
  end_date: string | null
  notes?: string | null
}

interface EditContractFormProps {
  contract: EditContractTarget
  // 아이콘만 쓰는 자리(표 안 등)에서는 iconOnly. 목록·카드에서는 글자를 함께 보여
  // 고객 정보 수정 연필과 헷갈리지 않게 한다.
  iconOnly?: boolean
  triggerClassName?: string
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function EditContractForm({ contract, iconOnly, triggerClassName }: EditContractFormProps) {
  const [open, setOpen] = useState(false)
  const focusRef = useAutoFocusRef<HTMLDivElement>()

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      service_type: contract.service_type ?? '',
      frequency: contract.frequency,
      contract_price: String(contract.contract_price),
      price_effective_from: todayKst(),
      price_change_note: '',
      start_date: contract.start_date,
      end_date: contract.end_date ?? '',
      notes: contract.notes ?? '',
    },
  })

  const { execute, isPending } = useAction(updateContractAction, {
    onSuccess: ({ data }) => {
      toast.success(data?.scheduleChanged ? '계약을 고쳤어요. 앞으로의 방문 일정도 다시 잡았어요' : '계약을 고쳤어요')
      // 서버 컴포넌트로 그린 카드·매출 숫자를 확실히 새로 받기 위해 전체 갱신
      window.location.replace(window.location.href)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '저장 못 했어요. 다시 눌러주세요')
    },
  })

  const priceRaw = watch('contract_price')
  const nextPrice = Number(priceRaw)
  const priceChanged = Number.isFinite(nextPrice) && nextPrice > 0 && nextPrice !== contract.contract_price
  const diff = nextPrice - contract.contract_price

  if (!open) {
    if (iconOnly) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="계약 수정"
          className={triggerClassName ?? 'inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'}
        >
          <Pencil className="h-4 w-4" />
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'inline-flex items-center gap-1 shrink-0 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-md px-2 py-1 transition-colors'}
      >
        <Pencil className="h-3 w-3 shrink-0" />
        계약 수정
      </button>
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
          <h2 className="font-semibold text-lg">정기계약 수정</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="닫기">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((data) =>
            execute({
              contractId: contract.id,
              service_type: data.service_type,
              frequency: data.frequency,
              contract_price: data.contract_price,
              price_effective_from: priceChanged ? data.price_effective_from : undefined,
              price_change_note: priceChanged ? data.price_change_note : undefined,
              start_date: data.start_date,
              end_date: data.end_date,
              notes: data.notes,
            }),
          )}
          className="space-y-3"
        >
          {/* 계약 이름 = 작업 범위. 범위가 늘면 여기부터 고친다 */}
          <div className="space-y-1">
            <Label htmlFor="service_type">계약 이름 (필수)</Label>
            <Input id="service_type" placeholder="공용부+진료센터 정기청소" {...register('service_type')} />
            <p className="text-xs text-muted-foreground">청소하는 범위가 드러나게 적으면 나중에 헷갈리지 않아요</p>
            {errors.service_type && <p className="text-xs text-destructive">{errors.service_type.message}</p>}
          </div>

          {/* 방문 주기 */}
          <div className="space-y-1">
            <Label>방문 주기 (필수)</Label>
            <FrequencyPicker
              value={watch('frequency') ?? ''}
              onChange={(val) => setValue('frequency', val, { shouldValidate: true })}
              error={errors.frequency?.message}
            />
          </div>

          {/* 월 금액 */}
          <div className="space-y-1">
            <Label htmlFor="contract_price">
              월 금액 (필수) <span className="text-xs font-normal text-muted-foreground">· 부가세 별도</span>
            </Label>
            <Input id="contract_price" type="number" inputMode="numeric" placeholder="1500000" {...register('contract_price')} />
            {errors.contract_price && <p className="text-xs text-destructive">{errors.contract_price.message}</p>}
          </div>

          {/* 금액이 실제로 바뀔 때만 — 언제부터·왜 */}
          {priceChanged && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-3">
              <p className="text-sm font-medium text-emerald-800 inline-flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 shrink-0" />
                월 {contract.contract_price.toLocaleString('ko-KR')}원 → {nextPrice.toLocaleString('ko-KR')}원
                <span className="text-xs font-normal">({diff > 0 ? '+' : ''}{diff.toLocaleString('ko-KR')}원)</span>
              </p>
              <div className="space-y-1">
                <Label htmlFor="price_effective_from" className="text-emerald-900">언제부터 이 금액인가요?</Label>
                <Input id="price_effective_from" type="date" {...register('price_effective_from')} className="bg-white" />
                <p className="text-xs text-emerald-800/80">이 날짜 전 매출은 예전 금액 그대로 남아요. 지난 달 매출이 바뀌지 않아요</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="price_change_note" className="text-emerald-900">왜 바뀌었나요?</Label>
                <Input
                  id="price_change_note"
                  placeholder="진료센터 추가"
                  {...register('price_change_note')}
                  className="bg-white"
                />
              </div>
            </div>
          )}

          {/* 기간 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="start_date">시작일 (필수)</Label>
              <Input id="start_date" type="date" {...register('start_date')} />
              {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="end_date">종료일 <span className="text-muted-foreground">(비우면 무기한)</span></Label>
              <Input id="end_date" type="date" {...register('end_date')} />
            </div>
          </div>

          {/* 메모 */}
          <div className="space-y-1">
            <Label htmlFor="notes">메모</Label>
            <textarea
              id="notes"
              {...register('notes')}
              placeholder="추가된 작업 범위, 특이사항..."
              className="w-full min-h-[60px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            방문 주기나 기간을 바꾸면 앞으로 잡힌 방문 일정을 다시 만들어요. 이미 끝난 방문은 그대로 남아요
          </p>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" className="flex-1 h-12" disabled={isPending}>
              {isPending ? '저장 중...' : '저장하기'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
