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
import { addBookingAction } from '@/lib/actions/bookings'
import { Plus, X, Search } from 'lucide-react'
import { openAddressSearch } from '@/lib/address/postcode'

const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

const schema = z.object({
  customer_name: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  customer_phone: z
    .string()
    .min(1, '연락처를 입력해주세요')
    .transform((val) => val.replace(/-/g, ''))
    .refine((val) => phoneRegex.test(val), '올바른 전화번호 형식이 아닙니다'),
  service_address: z.string().min(5, '주소를 입력해주세요'),
  cleaning_type: z.string().min(1, '서비스명을 입력해주세요'),
  scheduled_at: z.string().min(1, '예약 일시를 입력해주세요'),
  final_price: z.string().min(1, '금액을 입력해주세요'),
  memo: z.string().max(500).optional(),
})

type FormInput = z.infer<typeof schema>

export function AddBookingForm() {
  const [open, setOpen] = useState(false)

  const [addressDetail, setAddressDetail] = useState('')

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
  })

  const { execute, isPending } = useAction(addBookingAction, {
    onSuccess: () => {
      toast.success('예약이 추가되었습니다')
      reset()
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '예약 추가에 실패했습니다')
    },
  })

  const onSubmit = (data: FormInput) => {
    const base = data.service_address.split(' — ')[0]
    execute({
      ...data,
      service_address: addressDetail ? `${base} — ${addressDetail}` : base,
      final_price: Number(data.final_price),
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="h-4 w-4 mr-1" />
        예약 추가
      </Button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-lg border bg-card p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">수동 예약 추가</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="customer_name">고객명 *</Label>
          <Input id="customer_name" placeholder="홍길동" {...register('customer_name')} />
          {errors.customer_name && <p className="text-xs text-destructive">{errors.customer_name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="customer_phone">연락처 *</Label>
          <Input id="customer_phone" type="tel" placeholder="010-1234-5678" {...register('customer_phone')} />
          {errors.customer_phone && <p className="text-xs text-destructive">{errors.customer_phone.message}</p>}
        </div>
      </div>

      <div className="space-y-1">
        <Label>주소 *</Label>
        <button
          type="button"
          onClick={() => openAddressSearch((addr) => { setValue('service_address', addr, { shouldValidate: true }); setAddressDetail('') })}
          className="w-full h-10 rounded-md border border-input bg-background px-3 flex items-center justify-between text-sm text-left hover:bg-muted transition-colors"
        >
          <span className={watch('service_address') ? 'text-foreground' : 'text-muted-foreground'}>
            {watch('service_address') || '주소 검색하기'}
          </span>
          <Search className="h-4 w-4 text-primary shrink-0" />
        </button>
        {watch('service_address') && (
          <Input
            placeholder="상세 주소 입력 (예: 101동 1234호)"
            value={addressDetail}
            onChange={(e) => setAddressDetail(e.target.value)}
          />
        )}
        {errors.service_address && <p className="text-xs text-destructive">{errors.service_address.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="cleaning_type">서비스 *</Label>
          <Input id="cleaning_type" placeholder="예) 이사 청소" {...register('cleaning_type')} />
          {errors.cleaning_type && <p className="text-xs text-destructive">{errors.cleaning_type.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="final_price">금액 (원) *</Label>
          <Input id="final_price" type="number" placeholder="예) 150000" {...register('final_price')} />
          {errors.final_price && <p className="text-xs text-destructive">{errors.final_price.message}</p>}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="scheduled_at">예약 일시 *</Label>
        <Input id="scheduled_at" type="datetime-local" {...register('scheduled_at')} />
        {errors.scheduled_at && <p className="text-xs text-destructive">{errors.scheduled_at.message}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="memo">메모 (선택)</Label>
        <Input id="memo" placeholder="내부 메모" {...register('memo')} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? '추가 중...' : '추가'}
        </Button>
      </div>
    </form>
  )
}
