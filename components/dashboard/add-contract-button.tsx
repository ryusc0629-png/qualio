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

const schema = z.object({
  customer_id: z.string().uuid(),
  service_type: z.string().min(1, '서비스 유형을 선택해주세요'),
  frequency: z.string().min(1, '방문 주기를 선택해주세요'),
  contract_price: z.string().min(1, '계약금액을 입력해주세요'),
  start_date: z.string().min(1, '시작일을 입력해주세요'),
  end_date: z.string().optional(),
  notes: z.string().optional(),
})

type FormInput = z.infer<typeof schema>

const SERVICE_TYPES = ['일반청소', '입주청소', '사무실 청소', '공장 청소', '기타']

interface AddContractButtonProps {
  customerId: string
  customerName: string
}

export function AddContractButton({ customerId, customerName }: AddContractButtonProps) {
  const [open, setOpen] = useState(false)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: customerId,
      frequency: '',
    },
  })

  const { execute, isPending } = useAction(createContractAction, {
    onSuccess: () => {
      toast.success('계약이 등록되었습니다')
      reset()
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '등록에 실패했습니다')
    },
  })

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-xs h-7 px-2"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3 w-3 mr-1" />
        계약 추가
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <ScrollLock />
          <div ref={(el) => el?.focus()} tabIndex={-1} className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto overscroll-contain outline-none">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">정기계약 추가</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{customerName}</p>
              </div>
              <button onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit((data) => execute(data))} className="space-y-3">
              <input type="hidden" {...register('customer_id')} />

              <div className="space-y-1">
                <Label>서비스 유형 *</Label>
                <select
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

              <div className="space-y-1">
                <Label>방문 주기 *</Label>
                <FrequencyPicker
                  value={watch('frequency') ?? ''}
                  onChange={(val) => setValue('frequency', val, { shouldValidate: true })}
                  error={errors.frequency?.message}
                />
              </div>

              <div className="space-y-1">
                <Label>월 계약금액 (원) *</Label>
                <Input type="number" placeholder="300000" {...register('contract_price')} />
                {errors.contract_price && <p className="text-xs text-destructive">{errors.contract_price.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>시작일 *</Label>
                  <Input type="date" {...register('start_date')} />
                  {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">종료일 (미입력=무기한)</Label>
                  <Input type="date" {...register('end_date')} />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  취소
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? '등록 중...' : '계약 등록'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
