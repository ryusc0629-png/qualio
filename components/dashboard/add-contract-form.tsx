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
import { createContractAction } from '@/lib/actions/contracts'
import { FrequencyPicker } from '@/components/dashboard/frequency-picker'
import { Plus, X } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useAutoFocusRef } from '@/lib/hooks/use-auto-focus'

const schema = z.object({
  customer_id: z.string().min(1, '고객을 선택해주세요'),
  service_type: z.string().min(1, '서비스 유형을 입력해주세요'),
  frequency: z.string().min(1, '방문 주기를 선택해주세요'),
  contract_price: z.string().min(1, '계약금액을 입력해주세요'),
  start_date: z.string().min(1, '시작일을 입력해주세요'),
  end_date: z.string().optional(),
  notes: z.string().optional(),
})

type FormInput = z.infer<typeof schema>

const SERVICE_TYPES = ['일반청소', '입주청소', '사무실 청소', '공장 청소', '기타']

interface Customer {
  id: string
  name: string
  phone: string
}

interface AddContractFormProps {
  customers: Customer[]
  // 특정 고객 페이지에서 열 때 기본 선택값
  defaultCustomerId?: string
}

export function AddContractForm({ customers, defaultCustomerId }: AddContractFormProps) {
  const [open, setOpen] = useState(false)
  const focusRef = useAutoFocusRef<HTMLDivElement>()
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: defaultCustomerId ?? '',
      frequency: '',
    },
  })

  const { execute, isPending } = useAction(createContractAction, {
    onSuccess: () => {
      toast.success('정기계약이 등록되었습니다')
      reset()
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '등록에 실패했습니다')
    },
  })

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        계약 추가
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <ScrollLock />
      <div ref={focusRef} tabIndex={-1} className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto overscroll-contain outline-none">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">정기계약 추가</h2>
          <button onClick={() => setOpen(false)}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => execute(data))} className="space-y-3">
          {/* 고객 선택 */}
          <div className="space-y-1">
            <Label htmlFor="customer_id">고객 *</Label>
            <select
              id="customer_id"
              {...register('customer_id')}
              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
            >
              <option value="">고객 선택</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
            {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
          </div>

          {/* 서비스 유형 */}
          <div className="space-y-1">
            <Label htmlFor="service_type">서비스 유형 *</Label>
            <select
              id="service_type"
              {...register('service_type')}
              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
            >
              <option value="">선택</option>
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {errors.service_type && <p className="text-xs text-destructive">{errors.service_type.message}</p>}
          </div>

          {/* 방문 주기 */}
          <div className="space-y-1">
            <Label>방문 주기 *</Label>
            <FrequencyPicker
              value={watch('frequency') ?? ''}
              onChange={(val) => setValue('frequency', val, { shouldValidate: true })}
              error={errors.frequency?.message}
            />
          </div>

          {/* 월 계약금액 */}
          <div className="space-y-1">
            <Label htmlFor="contract_price">월 계약금액 (원) * <span className="text-xs font-normal text-muted-foreground">· 부가세 별도</span></Label>
            <Input
              id="contract_price"
              type="number"
              placeholder="300000"
              {...register('contract_price')}
            />
            {errors.contract_price && <p className="text-xs text-destructive">{errors.contract_price.message}</p>}
          </div>

          {/* 시작일 / 종료일 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="start_date">시작일 *</Label>
              <Input id="start_date" type="date" {...register('start_date')} />
              {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="end_date">종료일 <span className="text-muted-foreground">(미입력=무기한)</span></Label>
              <Input id="end_date" type="date" {...register('end_date')} />
            </div>
          </div>

          {/* 메모 */}
          <div className="space-y-1">
            <Label htmlFor="notes">메모</Label>
            <textarea
              id="notes"
              {...register('notes')}
              placeholder="계약 조건, 특이사항..."
              className="w-full min-h-[60px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? '등록 중...' : '등록'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
