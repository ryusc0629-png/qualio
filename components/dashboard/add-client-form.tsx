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
import { createLeadAction } from '@/lib/actions/crm'
import { createCustomerAction } from '@/lib/actions/customers'
import { Plus, X } from 'lucide-react'

const leadSchema = z.object({
  company_name: z.string().min(1, '업체명을 입력해주세요'),
  phone: z.string().optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  next_follow_up_date: z.string().optional(),
  notes: z.string().optional(),
})

const customerSchema = z.object({
  name: z.string().min(1, '업체명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요 (예: 010-1234-5678)'),
  address: z.string().optional(),
  category: z.string().optional(),
  type: z.string(),
  notes: z.string().optional(),
})

type LeadInput = z.infer<typeof leadSchema>
type CustomerInput = z.infer<typeof customerSchema>

const CATEGORIES = ['카페', '병원', '학원', '오피스', '상가', '식당', '헬스장', '기타']

export function AddClientForm() {
  const [open, setOpen] = useState(false)
  const [clientType, setClientType] = useState<'lead' | 'customer'>('lead')

  const leadForm = useForm<LeadInput>({ resolver: zodResolver(leadSchema) })
  const customerForm = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: { type: 'one_time' },
  })

  const { execute: executeLead, isPending: leadPending } = useAction(createLeadAction, {
    onSuccess: () => {
      toast.success('잠재고객이 추가됐어요!')
      leadForm.reset()
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: executeCustomer, isPending: customerPending } = useAction(createCustomerAction, {
    onSuccess: () => {
      toast.success('고객이 등록됐어요!')
      customerForm.reset()
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const isPending = leadPending || customerPending

  function handleClose() {
    setOpen(false)
    leadForm.reset()
    customerForm.reset()
    setClientType('lead')
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        추가하기
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">고객 추가</h2>
          <button onClick={handleClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* 종류 선택 */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
          <button
            type="button"
            onClick={() => setClientType('lead')}
            className={`py-2 rounded-md text-sm font-medium transition-colors ${
              clientType === 'lead'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            잠재고객
          </button>
          <button
            type="button"
            onClick={() => setClientType('customer')}
            className={`py-2 rounded-md text-sm font-medium transition-colors ${
              clientType === 'customer'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            활성 고객
          </button>
        </div>

        {clientType === 'lead' ? (
          <form
            onSubmit={leadForm.handleSubmit((data) => executeLead({ ...data }))}
            className="space-y-3"
          >
            <p className="text-xs text-muted-foreground -mt-1">
              아직 계약 전 — 방문했거나 관심 있는 업체를 기록해두세요
            </p>

            <div className="space-y-1">
              <Label htmlFor="lead-name">업체명 (필수)</Label>
              <Input id="lead-name" placeholder="강남 웰니스 카페" {...leadForm.register('company_name')} />
              {leadForm.formState.errors.company_name && (
                <p className="text-xs text-destructive">{leadForm.formState.errors.company_name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="lead-phone">연락처</Label>
                <Input id="lead-phone" placeholder="010-1234-5678" inputMode="tel" {...leadForm.register('phone')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lead-category">업종</Label>
                <select
                  id="lead-category"
                  {...leadForm.register('category')}
                  className="w-full h-10 rounded-lg border border-border bg-background px-2.5 text-sm"
                >
                  <option value="">선택 안함</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="lead-address">주소</Label>
              <Input id="lead-address" placeholder="서울시 강남구 역삼동" {...leadForm.register('address')} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="lead-followup">다음 연락 예정일</Label>
              <Input id="lead-followup" type="date" {...leadForm.register('next_follow_up_date')} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="lead-notes">메모</Label>
              <textarea
                id="lead-notes"
                {...leadForm.register('notes')}
                placeholder="관심 포인트, 담당자 이름 등..."
                className="w-full min-h-[60px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>취소</Button>
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending ? '추가 중...' : '추가하기'}
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={customerForm.handleSubmit((data) => executeCustomer(data))}
            className="space-y-3"
          >
            <p className="text-xs text-muted-foreground -mt-1">
              이미 서비스 중이거나 바로 등록할 고객이에요
            </p>

            <div className="space-y-1">
              <Label htmlFor="cust-name">업체명 (필수)</Label>
              <Input id="cust-name" placeholder="청라 오피스빌딩" {...customerForm.register('name')} />
              {customerForm.formState.errors.name && (
                <p className="text-xs text-destructive">{customerForm.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="cust-phone">연락처 (필수)</Label>
                <Input id="cust-phone" placeholder="010-1234-5678" inputMode="tel" {...customerForm.register('phone')} />
                {customerForm.formState.errors.phone && (
                  <p className="text-xs text-destructive">{customerForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="cust-category">업종</Label>
                <select
                  id="cust-category"
                  {...customerForm.register('category')}
                  className="w-full h-10 rounded-lg border border-border bg-background px-2.5 text-sm"
                >
                  <option value="">선택 안함</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cust-address">주소</Label>
              <Input id="cust-address" placeholder="서울시 강남구 역삼동" {...customerForm.register('address')} />
            </div>

            <div className="space-y-1">
              <Label>고객 구분</Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="one_time" {...customerForm.register('type')} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">개인 고객</p>
                    <p className="text-xs text-muted-foreground">개인·일회성</p>
                  </div>
                </label>
                <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="recurring" {...customerForm.register('type')} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">법인 고객</p>
                    <p className="text-xs text-muted-foreground">법인·정기계약</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cust-notes">메모</Label>
              <textarea
                id="cust-notes"
                {...customerForm.register('notes')}
                placeholder="특이사항, 출입 방법 등..."
                className="w-full min-h-[60px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>취소</Button>
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending ? '등록 중...' : '등록하기'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
