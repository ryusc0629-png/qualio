'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateCustomerAction } from '@/lib/actions/customers'
import { updateContractAction } from '@/lib/actions/contracts'
import { Pencil, X, TrendingUp } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useAutoFocusRef } from '@/lib/hooks/use-auto-focus'
import { formatPhone } from '@/lib/format/phone'
import { AddressField } from '@/components/ui/address-field'
import { FrequencyPicker } from '@/components/dashboard/frequency-picker'
import type { EditContractTarget } from '@/components/dashboard/edit-contract-form'

const customerSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1, '고객명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  address: z.string().optional(),
  category: z.string().optional(),
  type: z.string(),
  notes: z.string().optional(),
})

// 진행 중인 계약이 함께 있을 때만 검사하는 칸들 (계약이 없으면 화면에 아예 안 나옴)
const contractSchema = z.object({
  service_type: z.string().min(1, '계약 이름을 입력해주세요'),
  frequency: z.string().min(1, '방문 주기를 선택해주세요'),
  contract_price: z.string().min(1, '월 금액을 입력해주세요'),
  price_effective_from: z.string().optional(),
  price_change_note: z.string().optional(),
  start_date: z.string().min(1, '시작일을 입력해주세요'),
  end_date: z.string().optional(),
  contract_notes: z.string().optional(),
})

type FormInput = z.infer<typeof customerSchema> & Partial<z.infer<typeof contractSchema>>

const CATEGORIES = ['카페', '병원', '학원', '오피스', '상가', '식당', '헬스장', '기타']

interface EditCustomerButtonProps {
  customer: {
    id: string
    name: string
    phone: string
    address: string | null
    category: string | null
    type: string
    notes: string | null
  }
  // 진행 중인 계약이 있으면 같은 창에서 계약 내용까지 한 번에 고친다
  // (수정 버튼이 두 개로 나뉘어 있으면 어느 쪽을 눌러야 할지 헷갈림)
  contract?: EditContractTarget | null
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function EditCustomerButton({ customer, contract }: EditCustomerButtonProps) {
  const [open, setOpen] = useState(false)
  const focusRef = useAutoFocusRef<HTMLDivElement>()

  const resolver = useMemo(
    () => zodResolver(contract ? customerSchema.extend(contractSchema.shape) : customerSchema) as Resolver<FormInput>,
    [contract],
  )

  const { register, handleSubmit, control, setValue, watch, formState: { errors } } = useForm<FormInput>({
    resolver,
    defaultValues: {
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address ?? '',
      category: customer.category ?? '',
      type: customer.type,
      notes: customer.notes ?? '',
      service_type: contract?.service_type ?? '',
      frequency: contract?.frequency ?? '',
      contract_price: contract ? String(contract.contract_price) : '',
      price_effective_from: todayKst(),
      price_change_note: '',
      start_date: contract?.start_date ?? '',
      end_date: contract?.end_date ?? '',
      contract_notes: contract?.notes ?? '',
    },
  })

  const selectedType = useWatch({ control, name: 'type' })
  const isCompany = selectedType === 'recurring'

  const notesRef = useRef<HTMLTextAreaElement | null>(null)

  // 메모 높이 자동 조절
  const autoResize = useCallback(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(120, el.scrollHeight) + 'px'
  }, [])

  // 다이얼로그 열림 시 배경 스크롤 잠금 + 메모 높이 초기화
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    // 다음 프레임에서 메모 높이 조절
    requestAnimationFrame(autoResize)
    return () => { document.body.style.overflow = '' }
  }, [open, autoResize])

  const { executeAsync: saveCustomer } = useAction(updateCustomerAction)
  const { executeAsync: saveContract } = useAction(updateContractAction)
  const [isPending, setIsPending] = useState(false)

  // 월 금액이 실제로 바뀔 때만 '언제부터·왜' 칸을 띄운다 (지난 달 매출이 소급되지 않게)
  const nextPrice = Number(watch('contract_price'))
  const priceChanged = Boolean(
    contract && Number.isFinite(nextPrice) && nextPrice > 0 && nextPrice !== contract.contract_price,
  )
  const priceDiff = contract ? nextPrice - contract.contract_price : 0

  // 고객 정보와 계약 내용을 한 번에 저장 — 계약 저장이 실패해도 고객 정보는 이미 저장된 상태이므로 안내를 나눠서 띄운다
  const onSubmit = async (data: FormInput) => {
    setIsPending(true)
    try {
      const customerResult = await saveCustomer({
        customerId: data.customerId,
        name: data.name,
        phone: data.phone,
        address: data.address,
        category: data.category,
        type: data.type,
        notes: data.notes,
      })
      if (customerResult?.serverError || customerResult?.validationErrors) {
        toast.error(customerResult.serverError ?? '다시 시도해주세요')
        return
      }

      if (contract) {
        const contractResult = await saveContract({
          contractId: contract.id,
          service_type: data.service_type ?? '',
          frequency: data.frequency ?? '',
          contract_price: Number(data.contract_price),
          price_effective_from: priceChanged ? data.price_effective_from : undefined,
          price_change_note: priceChanged ? data.price_change_note : undefined,
          start_date: data.start_date ?? '',
          end_date: data.end_date,
          notes: data.contract_notes,
        })
        if (contractResult?.serverError || contractResult?.validationErrors) {
          toast.error(contractResult.serverError ?? '고객 정보는 저장됐지만 계약은 저장 못 했어요. 다시 눌러주세요')
          return
        }
      }

      toast.success('수정했어요!')
      setOpen(false)
      window.location.replace(isCompany ? '/dashboard/clients?type=company' : '/dashboard/clients?type=individual')
    } catch {
      toast.error('저장 못 했어요. 다시 눌러주세요')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title={contract ? '고객·계약 수정' : '수정'}
        aria-label={contract ? '고객·계약 수정' : '수정'}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <ScrollLock />
          <div ref={focusRef} tabIndex={-1} className="bg-background rounded-xl border shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto overscroll-contain p-6 space-y-4 outline-none">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">
                {contract ? '고객·계약 수정' : isCompany ? '법인 고객 수정' : '개인 고객 수정'}
              </h2>
              <button onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <input type="hidden" {...register('customerId')} />

              {/* 이름 — 개인은 '고객명', 법인은 '업체명' */}
              <div className="space-y-1">
                <Label htmlFor="edit-name">{isCompany ? '업체명 (필수)' : '고객명 (필수)'}</Label>
                <Input id="edit-name" placeholder={isCompany ? '예: (주)클린빌딩' : '예: 김영희'} {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              {/* 고객 구분 — 추가 폼과 동일하게 이름 바로 아래 배치 */}
              <div className="space-y-1">
                <Label>고객 구분 (필수)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="radio" value="one_time" {...register('type')} className="accent-primary" />
                    <div>
                      <p className="text-sm font-medium">개인 고객</p>
                      <p className="text-xs text-muted-foreground">개인·일회성</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="radio" value="recurring" {...register('type')} className="accent-primary" />
                    <div>
                      <p className="text-sm font-medium">법인 고객</p>
                      <p className="text-xs text-muted-foreground">법인·정기계약</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* 연락처 (+ 법인일 때만 업종) — 추가 폼과 동일 */}
              <div className={`grid gap-2 ${isCompany ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div className="space-y-1">
                  <Label htmlFor="edit-phone">연락처 (필수)</Label>
                  <Input
                    id="edit-phone"
                    placeholder="010-1234-5678"
                    inputMode="numeric"
                    autoComplete="off"
                    value={watch('phone') ?? ''}
                    onChange={(e) => setValue('phone', formatPhone(e.target.value))}
                  />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>
                {isCompany && (
                  <div className="space-y-1">
                    <Label htmlFor="edit-category">업종</Label>
                    <select
                      id="edit-category"
                      {...register('category')}
                      className="w-full h-10 rounded-lg border border-border bg-background px-2.5 text-sm"
                    >
                      <option value="">선택 안함</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 주소 — 추가 폼과 동일하게 검색 버튼 + 상세 주소 제공 */}
              <AddressField
                id="edit-address"
                value={watch('address') ?? ''}
                onChange={(next) => setValue('address', next)}
              />

              <div className="space-y-1">
                <Label htmlFor="edit-notes">메모</Label>
                <textarea
                  id="edit-notes"
                  {...register('notes', {
                    onChange: autoResize,
                  })}
                  ref={(el) => {
                    register('notes').ref(el)
                    notesRef.current = el
                  }}
                  className="w-full min-h-[120px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y"
                  placeholder="비밀번호, 주의사항 등 메모를 입력해주세요"
                />
              </div>

              {/* ── 진행 중인 정기계약 — 같은 창에서 이어서 고친다 ── */}
              {contract && (
                <div className="pt-3 mt-1 border-t space-y-3">
                  <p className="text-sm font-semibold text-emerald-700">정기계약 내용</p>

                  {/* 계약 이름 = 작업 범위. 범위가 늘면 여기부터 고친다 */}
                  <div className="space-y-1">
                    <Label htmlFor="edit-service-type">계약 이름 (필수)</Label>
                    <Input id="edit-service-type" placeholder="공용부+진료센터 정기청소" {...register('service_type')} />
                    <p className="text-xs text-muted-foreground">청소하는 범위가 드러나게 적으면 나중에 헷갈리지 않아요</p>
                    {errors.service_type && <p className="text-xs text-destructive">{errors.service_type.message}</p>}
                  </div>

                  <div className="space-y-1">
                    <Label>방문 주기 (필수)</Label>
                    <FrequencyPicker
                      value={watch('frequency') ?? ''}
                      onChange={(val) => setValue('frequency', val, { shouldValidate: true })}
                      error={errors.frequency?.message}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-contract-price">
                      월 금액 (필수) <span className="text-xs font-normal text-muted-foreground">· 부가세 별도</span>
                    </Label>
                    <Input
                      id="edit-contract-price"
                      type="number"
                      inputMode="numeric"
                      placeholder="1500000"
                      {...register('contract_price')}
                    />
                    {errors.contract_price && <p className="text-xs text-destructive">{errors.contract_price.message}</p>}
                  </div>

                  {/* 금액이 실제로 바뀔 때만 — 언제부터·왜 */}
                  {priceChanged && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-3">
                      <p className="text-sm font-medium text-emerald-800 inline-flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 shrink-0" />
                        월 {contract.contract_price.toLocaleString('ko-KR')}원 → {nextPrice.toLocaleString('ko-KR')}원
                        <span className="text-xs font-normal">({priceDiff > 0 ? '+' : ''}{priceDiff.toLocaleString('ko-KR')}원)</span>
                      </p>
                      <div className="space-y-1">
                        <Label htmlFor="edit-price-from" className="text-emerald-900">언제부터 이 금액인가요?</Label>
                        <Input id="edit-price-from" type="date" {...register('price_effective_from')} className="bg-white" />
                        <p className="text-xs text-emerald-800/80">이 날짜 전 매출은 예전 금액 그대로 남아요. 지난 달 매출이 바뀌지 않아요</p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-price-note" className="text-emerald-900">왜 바뀌었나요?</Label>
                        <Input id="edit-price-note" placeholder="진료센터 추가" {...register('price_change_note')} className="bg-white" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="edit-start-date">시작일 (필수)</Label>
                      <Input id="edit-start-date" type="date" {...register('start_date')} />
                      {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-end-date">종료일 <span className="text-muted-foreground">(비우면 무기한)</span></Label>
                      <Input id="edit-end-date" type="date" {...register('end_date')} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-contract-notes">계약 메모</Label>
                    <textarea
                      id="edit-contract-notes"
                      {...register('contract_notes')}
                      placeholder="추가된 작업 범위, 특이사항..."
                      className="w-full min-h-[60px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  취소
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? '저장 중...' : '저장'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
