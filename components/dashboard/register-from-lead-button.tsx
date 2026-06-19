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
import { createCustomerWithContractAction } from '@/lib/actions/customers'
import { FrequencyPicker } from '@/components/dashboard/frequency-picker'
import { UserPlus, X } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'

const schema = z.object({
  name: z.string().min(1, '고객명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  address: z.string().optional(),
  category: z.string().optional(),
  lead_id: z.string().optional(),
  notes: z.string().optional(),
  hasContract: z.string().optional(),
  service_type: z.string().optional(),
  frequency: z.string().optional(),
  contract_price: z.string().optional(),
  start_date: z.string().optional(),
})

type FormInput = z.infer<typeof schema>

const SERVICE_TYPES = ['일반청소', '입주청소', '사무실 청소', '공장 청소', '기타']

interface RegisterFromLeadButtonProps {
  lead: {
    id: string
    company_name: string
    phone: string | null
    address: string | null
    category: string | null
  }
  alreadyRegistered: boolean
}

export function RegisterFromLeadButton({ lead, alreadyRegistered }: RegisterFromLeadButtonProps) {
  const [open, setOpen] = useState(false)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: lead.company_name,
      phone: lead.phone ?? '',
      address: lead.address ?? '',
      category: lead.category ?? '',
      lead_id: lead.id,
      hasContract: '',
      frequency: '',
    },
  })

  const hasContract = watch('hasContract')

  const { execute, isPending } = useAction(createCustomerWithContractAction, {
    onSuccess: () => {
      toast.success('고객으로 등록되었습니다')
      reset()
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '등록에 실패했습니다')
    },
  })

  if (alreadyRegistered) {
    return (
      <span className="text-xs text-green-600 font-medium">✓ 등록완료</span>
    )
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-xs h-7 px-2 border-green-300 text-green-700 hover:bg-green-50"
        onClick={() => setOpen(true)}
      >
        <UserPlus className="h-3 w-3 mr-1" />
        고객 등록
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <ScrollLock />
          <div ref={(el) => el?.focus()} tabIndex={-1} className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto overscroll-contain outline-none">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">고객 등록</h2>
                <p className="text-xs text-muted-foreground mt-0.5">CRM에서 계약완료된 업체를 고객으로 전환합니다</p>
              </div>
              <button onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit((data) => execute(data))} className="space-y-3">
              {/* 기본 정보 (자동 입력) */}
              <div className="space-y-1">
                <Label htmlFor="name">고객(업체)명 *</Label>
                <Input id="name" {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="phone">연락처 *</Label>
                  <Input id="phone" {...register('phone')} />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="category">업종</Label>
                  <Input id="category" {...register('category')} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="address">주소</Label>
                <Input id="address" {...register('address')} />
              </div>

              {/* 숨김 필드 */}
              <input type="hidden" {...register('lead_id')} />

              {/* 정기계약 등록 여부 */}
              <div className="rounded-lg border p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    value="true"
                    {...register('hasContract')}
                    className="w-4 h-4 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">정기계약도 함께 등록할게요</p>
                    <p className="text-xs text-muted-foreground">매달 방문하는 계약이라면 체크하세요</p>
                  </div>
                </label>

                {hasContract === 'true' && (
                  <div className="space-y-3 pt-1 border-t">
                    {/* 서비스 유형 */}
                    <div className="space-y-1">
                      <Label>서비스 유형</Label>
                      <select
                        {...register('service_type')}
                        className="w-full h-8 rounded-lg border border-border bg-background px-2.5 text-sm"
                      >
                        <option value="">선택</option>
                        {SERVICE_TYPES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    {/* 방문 주기 */}
                    <div className="space-y-1">
                      <Label>방문 주기</Label>
                      <FrequencyPicker
                        value={watch('frequency') ?? ''}
                        onChange={(val) => setValue('frequency', val, { shouldValidate: true })}
                        error={errors.frequency?.message}
                      />
                    </div>

                    {/* 월 계약금액 */}
                    <div className="space-y-1">
                      <Label>월 계약금액 (원)</Label>
                      <Input
                        type="number"
                        placeholder="300000"
                        {...register('contract_price')}
                      />
                    </div>

                    {/* 시작일 */}
                    <div className="space-y-1">
                      <Label>계약 시작일</Label>
                      <Input type="date" {...register('start_date')} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  취소
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? '등록 중...' : '고객 등록'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
