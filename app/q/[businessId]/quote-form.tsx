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

const step1Schema = z.object({
  service_id: z.string().min(1, '서비스를 선택해주세요'),
  space_size: z.string().optional(),
  preferred_date: z.string().optional(),
  extra_notes: z.string().max(500).optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
})

type Step1Input = z.infer<typeof step1Schema>

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
  const selectedService = services.find((s) => s.id === selectedServiceId)
  const isPricePer = selectedService?.unit === '평당'

  const form = useForm<Step1Input>({ resolver: zodResolver(step1Schema) })

  // 가격 계산 성공 시 전용 랜딩 페이지로 이동
  const { execute, isPending } = useAction(calculateAndCreateQuoteAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      window.location.replace(`/q/${businessId}/quote/${data.quoteId}`)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '견적 계산에 실패했습니다'),
  })

  const onSubmit = (data: Step1Input) => {
    const spaceSize = data.space_size ? Number(data.space_size) : undefined
    if (isPricePer && (!spaceSize || spaceSize < 1)) {
      form.setError('space_size', { message: '평당 서비스는 평수를 입력해주세요' })
      return
    }
    execute({
      business_id:    businessId,
      service_id:     data.service_id,
      space_size:     spaceSize,
      preferred_date: data.preferred_date || undefined,
      extra_notes:    data.extra_notes || undefined,
      customer_name:  data.customer_name || undefined,
      customer_phone: data.customer_phone || undefined,
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
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-muted-foreground">등록된 서비스가 없습니다</p>
        )}
        {form.formState.errors.service_id && (
          <p className="text-xs text-destructive">{form.formState.errors.service_id.message}</p>
        )}
      </div>

      {/* 평수 */}
      <div className="space-y-1">
        <Label htmlFor="space_size">
          평수{isPricePer ? ' (필수)' : ' (선택)'}
          {isPricePer && <span className="ml-1 text-xs text-muted-foreground font-normal">— 가격 계산에 사용됩니다</span>}
        </Label>
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

      {/* 희망 날짜 */}
      <div className="space-y-1">
        <Label htmlFor="preferred_date">희망 날짜 (선택)</Label>
        <Input id="preferred_date" type="date" className="h-11" {...form.register('preferred_date')} />
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

      {/* 연락처 — 카카오 알림톡 수신 */}
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
              className="h-9 text-sm"
              {...form.register('customer_name')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="customer_phone" className="text-xs">연락처</Label>
            <Input
              id="customer_phone"
              placeholder="01012345678"
              inputMode="numeric"
              className="h-9 text-sm"
              {...form.register('customer_phone')}
              onChange={(e) => {
                const numOnly = e.target.value.replace(/\D/g, '')
                form.setValue('customer_phone', numOnly)
              }}
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isPending || services.length === 0}>
        {isPending ? '맞춤 견적을 계산하고 있어요...' : '견적 확인하기 →'}
      </Button>
    </form>
  )
}
