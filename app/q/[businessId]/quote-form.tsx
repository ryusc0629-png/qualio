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
import { calculateAndCreateQuoteAction } from '@/lib/actions/quotes'

const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

const formSchema = z.object({
  service_id:     z.string().min(1, '서비스를 선택해주세요'),
  space_size:     z.string().min(1, '평수를 입력해주세요'),
  customer_name:  z.string().min(2, '이름을 입력해주세요 (2자 이상)'),
  customer_phone: z
    .string()
    .min(1, '연락처를 입력해주세요')
    .refine((v) => phoneRegex.test(v.replace(/-/g, '')), '올바른 전화번호를 입력해주세요 (예: 01012345678)'),
  extra_notes: z.string().max(500).optional(),
})

type FormInput = z.infer<typeof formSchema>

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
  const [selectedServiceId, setSelectedServiceId] = useState<string>('')

  const form = useForm<FormInput>({ resolver: zodResolver(formSchema) })

  const { execute, isPending } = useAction(calculateAndCreateQuoteAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      window.location.replace(`/q/${businessId}/quote/${data.quoteId}`)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '견적 계산에 실패했습니다'),
  })

  const onSubmit = (data: FormInput) => {
    const spaceSize = Number(data.space_size)
    if (!spaceSize || spaceSize < 1) {
      form.setError('space_size', { message: '평수를 올바르게 입력해주세요' })
      return
    }
    execute({
      business_id:    businessId,
      service_id:     data.service_id,
      space_size:     spaceSize,
      extra_notes:    data.extra_notes || undefined,
      customer_name:  data.customer_name,
      customer_phone: data.customer_phone.replace(/-/g, ''),
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      {/* 서비스 선택 */}
      <div className="space-y-1">
        <Label htmlFor="service_id">서비스 선택 (필수)</Label>
        {services.length > 0 ? (
          <select
            id="service_id"
            {...form.register('service_id')}
            onChange={(e) => {
              form.setValue('service_id', e.target.value)
              setSelectedServiceId(e.target.value)
            }}
            className="w-full h-11 rounded-md border bg-background px-3 text-sm"
            defaultValue=""
          >
            <option value="" disabled>서비스를 선택해주세요</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-muted-foreground">등록된 서비스가 없습니다</p>
        )}
        {form.formState.errors.service_id && (
          <p className="text-xs text-destructive">{form.formState.errors.service_id.message}</p>
        )}
      </div>

      {/* 평수 — 항상 필수 */}
      <div className="space-y-1">
        <Label htmlFor="space_size">평수 (필수)</Label>
        <Input
          id="space_size"
          type="number"
          inputMode="numeric"
          placeholder="예) 25"
          className="h-11"
          {...form.register('space_size')}
        />
        {form.formState.errors.space_size && (
          <p className="text-xs text-destructive">{form.formState.errors.space_size.message}</p>
        )}
      </div>

      {/* 추가 요청사항 */}
      <div className="space-y-1">
        <Label htmlFor="extra_notes">추가 요청사항 (선택)</Label>
        <textarea
          id="extra_notes"
          {...form.register('extra_notes')}
          placeholder="특이사항이나 요청사항을 입력해주세요"
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 연락처 — 필수 */}
      <div className="rounded-lg border p-4 space-y-3 bg-yellow-50/50 border-yellow-200">
        <p className="text-xs font-semibold text-yellow-800">
          📱 견적서를 카카오톡으로 보내드려요 (필수)
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="customer_name" className="text-xs">이름 (필수)</Label>
            <Input
              id="customer_name"
              placeholder="홍길동"
              className="h-10 text-sm"
              {...form.register('customer_name')}
            />
            {form.formState.errors.customer_name && (
              <p className="text-xs text-destructive">{form.formState.errors.customer_name.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="customer_phone" className="text-xs">연락처 (필수)</Label>
            <Input
              id="customer_phone"
              placeholder="01012345678"
              inputMode="numeric"
              className="h-10 text-sm"
              {...form.register('customer_phone')}
              onChange={(e) => {
                const numOnly = e.target.value.replace(/\D/g, '')
                form.setValue('customer_phone', numOnly)
              }}
            />
            {form.formState.errors.customer_phone && (
              <p className="text-xs text-destructive">{form.formState.errors.customer_phone.message}</p>
            )}
          </div>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full h-12 text-base font-bold"
        disabled={isPending || services.length === 0}
      >
        {isPending ? '맞춤 견적을 계산하고 있어요...' : '견적 확인하기 →'}
      </Button>
    </form>
  )
}
