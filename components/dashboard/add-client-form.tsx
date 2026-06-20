'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FrequencyPicker } from '@/components/dashboard/frequency-picker'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { createLeadAction } from '@/lib/actions/crm'
import { createActiveCustomerAction } from '@/lib/actions/customers'
import { Plus, X, Search, Trash2 } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { formatPhone } from '@/lib/format/phone'
import { openAddressSearch } from '@/lib/address/postcode'

// 숫자 입력 쉼표 처리 헬퍼
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')
const formatThousands = (v: string) => {
  const d = digitsOnly(v)
  return d ? Number(d).toLocaleString('ko-KR') : ''
}

const leadSchema = z.object({
  company_name: z.string().min(1, '업체명을 입력해주세요'),
  customer_type: z.string().refine(
    (v) => ['individual', 'company'].includes(v),
    '개인 또는 법인을 선택해주세요',
  ),
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
  type: z.string().refine(
    (v) => ['one_time', 'recurring'].includes(v),
    '개인 또는 법인을 선택해주세요',
  ),
  notes: z.string().optional(),
  // 개인 — 첫 작업 일정 (선택)
  scheduleJob: z.string().optional(),
  job_service: z.string().optional(),
  job_scheduled_at: z.string().optional(),
  job_price: z.string().optional(),
  // 법인 — 정기계약 (선택)
  hasContract: z.string().optional(),
  service_type: z.string().optional(),
  frequency: z.string().optional(),
  contract_price: z.string().optional(),
  start_date: z.string().optional(),
})

type LeadInput = z.infer<typeof leadSchema>
type CustomerInput = z.infer<typeof customerSchema>

const CATEGORIES = ['카페', '병원', '학원', '오피스', '상가', '식당', '헬스장', '기타']

interface ServiceOption {
  name: string
  base_price: number
  unit: string // '정액' | '평당' | '개'
}

// 단위별 라벨 — 수량 단위 / 단가 표현
const qtyUnitOf = (unit: string) => (unit === '평당' ? '평' : unit === '정액' ? '회' : '개')
const perLabelOf = (unit: string) => (unit === '평당' ? '평당' : unit === '정액' ? '정액' : '대당')

interface AddClientFormProps {
  // 사이드바 '서비스 항목'에 등록된 서비스(이름+가격). 없으면 기본값 사용
  services?: ServiceOption[]
  // 트리거 버튼 라벨 (일정 페이지에선 '신규 일정 추가' 등으로 사용)
  triggerLabel?: string
  // 등록 성공 후 새로고침 (일정 보드는 로컬 state라 revalidate만으론 즉시 반영 안 됨)
  refreshOnSuccess?: boolean
}

const DEFAULT_SERVICES = ['일반청소', '입주청소', '사무실 청소', '공장 청소', '기타']

export function AddClientForm({ services = [], triggerLabel = '추가하기', refreshOnSuccess = false }: AddClientFormProps) {
  // 등록된 서비스가 있으면 그걸 쓰고, 없으면 기본값(가격 0)
  const serviceItems: ServiceOption[] = services.length > 0
    ? services
    : DEFAULT_SERVICES.map((name) => ({ name, base_price: 0, unit: '개' }))
  // 드롭다운 이름 목록 — 마지막에 '기타' 보장
  const serviceOptions = [...serviceItems.map((s) => s.name), '기타']
  // 서비스명 → 기본 가격 / 단위
  const priceForService = (name: string) => serviceItems.find((s) => s.name === name)?.base_price ?? 0
  const unitForService = (name: string) => serviceItems.find((s) => s.name === name)?.unit ?? '개'
  const [open, setOpen] = useState(false)
  const [clientType, setClientType] = useState<'lead' | 'customer'>('lead')
  // 모달 컨테이너 — 열릴 때 한 번만 포커스 (매 렌더 재포커스로 입력 포커스 뺏기던 버그 방지)
  const modalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) modalRef.current?.focus()
  }, [open])
  // 첫 작업 일정 — 다른 설정 창과 동일한 달력+시/분 선택 방식
  const [jobDate, setJobDate] = useState('')
  // 시간은 기본 선택하지 않음 — 사용자가 고르기 전엔 아무것도 강조되지 않게 (Jobber 방식)
  const [jobTime, setJobTime] = useState('')
  // 첫 작업 견적 — 기본은 항목별(서비스 선택), 체크 시 수기 단일 금액
  // amount(합산 금액)도 직접 수정 가능 — 수량×단가와 연동
  const [useJobItems, setUseJobItems] = useState(true)
  const [jobItems, setJobItems] = useState<{ name: string; qty: string; unitPrice: string; amount: string; unit: string }[]>([
    { name: '', qty: '1', unitPrice: '', amount: '', unit: '개' },
  ])
  const jobItemsTotal = jobItems.reduce((s, it) => s + (parseInt(it.amount, 10) || 0), 0)
  const emptyJobItem = { name: '', qty: '1', unitPrice: '', amount: '', unit: '개' }
  const addJobItem = () => setJobItems((prev) => [...prev, { ...emptyJobItem }])
  const removeJobItem = (idx: number) => setJobItems((prev) => prev.filter((_, i) => i !== idx))
  // 수기 모드 — 항목명 직접 입력
  const setJobName = (idx: number, v: string) =>
    setJobItems((prev) => prev.map((it, i) => (i === idx ? { ...it, name: v } : it)))
  // 수량/단가 수정 → 합산 금액 자동 계산
  const setJobQty = (idx: number, v: string) =>
    setJobItems((prev) => prev.map((it, i) => i === idx
      ? { ...it, qty: v, amount: String((parseInt(v, 10) || 0) * (parseInt(it.unitPrice, 10) || 0)) } : it))
  const setJobUnit = (idx: number, v: string) =>
    setJobItems((prev) => prev.map((it, i) => i === idx
      ? { ...it, unitPrice: v, amount: String((parseInt(it.qty, 10) || 0) * (parseInt(v, 10) || 0)) } : it))
  // 합산 금액 직접 수정 → 단가는 합산÷수량으로 역산
  const setJobAmount = (idx: number, v: string) =>
    setJobItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it
      const qty = parseInt(it.qty, 10) || 1
      const amount = parseInt(v, 10) || 0
      return { ...it, amount: v, unitPrice: qty > 0 ? String(Math.round(amount / qty)) : v }
    }))
  // 서비스 선택 시 등록된 기본 가격을 단가에 자동 채움 (이후 수정 가능)
  const selectJobItemService = (idx: number, name: string) => {
    const price = priceForService(name)
    const unit = unitForService(name)
    setJobItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it
      const unitPrice = price > 0 ? String(price) : it.unitPrice
      return { ...it, name, unit, unitPrice, amount: String((parseInt(it.qty, 10) || 0) * (parseInt(unitPrice, 10) || 0)) }
    }))
  }

  const leadForm = useForm<LeadInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: { customer_type: '' },
  })
  const customerForm = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: { type: '', scheduleJob: '', hasContract: '' },
  })

  const { execute: executeLead, isPending: leadPending } = useAction(createLeadAction, {
    onSuccess: () => {
      toast.success('잠재 고객이 추가됐어요!')
      leadForm.reset({ customer_type: '' })
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: executeCustomer, isPending: customerPending } = useAction(createActiveCustomerAction, {
    onSuccess: () => {
      toast.success('고객이 등록됐어요!')
      customerForm.reset({ type: '', scheduleJob: '', hasContract: '' })
      setJobDate('')
      setJobTime('')
      setUseJobItems(true)
      setJobItems([{ ...emptyJobItem }])
      setOpen(false)
      // 일정 보드는 로컬 state라 새 예약을 즉시 못 받음 → 새로고침으로 캘린더에 바로 반영
      if (refreshOnSuccess) window.location.reload()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const isPending = leadPending || customerPending

  // 업종 노출 여부 — 법인 고객일 때만 (개인은 업종 의미 없음)
  const leadIsCompany = leadForm.watch('customer_type') === 'company'
  const leadIsIndividual = leadForm.watch('customer_type') === 'individual'
  const custType = customerForm.watch('type')
  const custIsCompany = custType === 'recurring'
  const custIsIndividual = custType === 'one_time'
  const scheduleJob = customerForm.watch('scheduleJob') === 'true'
  const hasContract = customerForm.watch('hasContract') === 'true'

  function handleClose() {
    setOpen(false)
    leadForm.reset({ customer_type: '' })
    customerForm.reset({ type: '', scheduleJob: '', hasContract: '' })
    setJobDate('')
    setJobTime('')
    setUseJobItems(true)
    setJobItems([{ ...emptyJobItem }])
    setClientType('lead')
  }

  // 창 외부 클릭으로 닫기 — 입력 중이면 실수 방지 확인 (Jobber식 안전장치)
  function requestClose() {
    const hasJobInput = jobItems.some((it) => it.name.trim() || it.amount.trim() || it.unitPrice.trim())
    const dirty = customerForm.formState.isDirty || leadForm.formState.isDirty || hasJobInput
    if (dirty && !window.confirm('입력한 내용이 사라져요. 닫을까요?')) return
    handleClose()
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        {triggerLabel}
      </Button>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={requestClose}
    >
      <ScrollLock />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto overscroll-contain outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">고객 추가</h2>
          <button onClick={handleClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* 종류 선택 — 선택 상태를 색상 + 테두리로 뚜렷하게 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setClientType('lead')}
            className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${
              clientType === 'lead'
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
            }`}
          >
            잠재 고객
          </button>
          <button
            type="button"
            onClick={() => setClientType('customer')}
            className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${
              clientType === 'customer'
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
            }`}
          >
            확정 고객
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
              <Label htmlFor="lead-name">{leadIsIndividual ? '고객명 (필수)' : '업체명 (필수)'}</Label>
              <Input id="lead-name" placeholder={leadIsIndividual ? '예: 김영희' : '강남 웰니스 카페'} autoComplete="off" {...leadForm.register('company_name')} />
              {leadForm.formState.errors.company_name && (
                <p className="text-xs text-destructive">{leadForm.formState.errors.company_name.message}</p>
              )}
            </div>

            {/* 고객 구분 — 개인/법인 (필수 선택, 기본값 없음) */}
            <div className="space-y-1">
              <Label>고객 구분 (필수)</Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="individual" {...leadForm.register('customer_type')} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">개인 고객</p>
                    <p className="text-xs text-muted-foreground">개인·일회성</p>
                  </div>
                </label>
                <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="company" {...leadForm.register('customer_type')} className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">법인 고객</p>
                    <p className="text-xs text-muted-foreground">법인·정기계약</p>
                  </div>
                </label>
              </div>
              {leadForm.formState.errors.customer_type && (
                <p className="text-xs text-destructive">{leadForm.formState.errors.customer_type.message}</p>
              )}
            </div>

            <div className={`grid gap-2 ${leadIsCompany ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-1">
                <Label htmlFor="lead-phone">연락처</Label>
                <Input
                  id="lead-phone"
                  placeholder="010-1234-5678"
                  inputMode="numeric"
                  autoComplete="off"
                  value={leadForm.watch('phone') ?? ''}
                  onChange={(e) => leadForm.setValue('phone', formatPhone(e.target.value))}
                />
              </div>
              {leadIsCompany && (
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
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="lead-address">주소</Label>
              <div className="flex gap-2">
                <Input id="lead-address" placeholder="주소 검색을 눌러주세요" autoComplete="off" {...leadForm.register('address')} />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 px-3"
                  onClick={() => openAddressSearch((addr) => leadForm.setValue('address', addr))}
                >
                  <Search className="h-4 w-4 mr-1" />
                  검색
                </Button>
              </div>
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
            onSubmit={customerForm.handleSubmit((data) => {
              // 첫 작업 일정을 켰다면 날짜·시간은 둘 다 골라야 함 (필수)
              if (custIsIndividual && scheduleJob) {
                if (!jobDate) { toast.error('작업 날짜를 선택해주세요'); return }
                if (!jobTime) { toast.error('작업 시간을 선택해주세요'); return }
              }
              executeCustomer({
                ...data,
                job_scheduled_at: jobDate && jobTime ? `${jobDate}T${jobTime}:00+09:00` : '',
                job_items: (() => {
                  const valid = jobItems.filter((it) => it.name.trim() || parseInt(it.amount, 10) > 0)
                  return valid.length > 0
                    ? valid.map((it) => ({
                        name: it.name.trim() || '작업',
                        quantity: parseInt(it.qty, 10) || 1,
                        unitPrice: parseInt(it.unitPrice, 10) || 0,
                        amount: parseInt(it.amount, 10) || 0,
                        unit: useJobItems ? it.unit : '개',
                      }))
                    : undefined
                })(),
              })
            })}
            className="space-y-3"
          >
            <p className="text-xs text-muted-foreground -mt-1">
              이미 서비스 중이거나 바로 등록할 고객이에요
            </p>

            <div className="space-y-1">
              <Label htmlFor="cust-name">{custIsIndividual ? '고객명 (필수)' : '업체명 (필수)'}</Label>
              <Input id="cust-name" placeholder={custIsIndividual ? '예: 김영희' : '청라 오피스빌딩'} autoComplete="off" {...customerForm.register('name')} />
              {customerForm.formState.errors.name && (
                <p className="text-xs text-destructive">{customerForm.formState.errors.name.message}</p>
              )}
            </div>

            {/* 고객 구분 — 필수 선택, 기본값 없음 */}
            <div className="space-y-1">
              <Label>고객 구분 (필수)</Label>
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
              {customerForm.formState.errors.type && (
                <p className="text-xs text-destructive">{customerForm.formState.errors.type.message}</p>
              )}
            </div>

            <div className={`grid gap-2 ${custIsCompany ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-1">
                <Label htmlFor="cust-phone">연락처 (필수)</Label>
                <Input
                  id="cust-phone"
                  placeholder="010-1234-5678"
                  inputMode="numeric"
                  autoComplete="off"
                  value={customerForm.watch('phone') ?? ''}
                  onChange={(e) => customerForm.setValue('phone', formatPhone(e.target.value))}
                />
                {customerForm.formState.errors.phone && (
                  <p className="text-xs text-destructive">{customerForm.formState.errors.phone.message}</p>
                )}
              </div>
              {custIsCompany && (
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
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="cust-address">주소</Label>
              <div className="flex gap-2">
                <Input id="cust-address" placeholder="주소 검색을 눌러주세요" autoComplete="off" {...customerForm.register('address')} />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 px-3"
                  onClick={() => openAddressSearch((addr) => customerForm.setValue('address', addr))}
                >
                  <Search className="h-4 w-4 mr-1" />
                  검색
                </Button>
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

            {/* 개인 고객 — 첫 작업 일정 (선택) → 캘린더 노출 */}
            {custIsIndividual && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleJob}
                    onChange={(e) => customerForm.setValue('scheduleJob', e.target.checked ? 'true' : '')}
                    className="accent-primary h-4 w-4"
                  />
                  <span className="text-sm font-medium">첫 작업 일정도 같이 잡기</span>
                </label>
                <p className="text-xs text-muted-foreground -mt-1.5">
                  날짜·금액을 넣으면 예약으로 등록돼 캘린더에 바로 나타나요
                </p>

                {scheduleJob && (
                  <div className="space-y-3 pt-1">
                    {/* 1. 견적 (메인) — 기본은 서비스 항목 선택, 체크 시 수기 단일 금액 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>견적 (필수)</Label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={!useJobItems}
                            onChange={(e) => setUseJobItems(!e.target.checked)}
                            className="accent-primary h-3.5 w-3.5"
                          />
                          수기로 견적 작성하기
                        </label>
                      </div>

                      <div className="space-y-2">
                          {jobItems.map((it, idx) => (
                            <div key={idx} className="rounded-lg bg-white border border-border p-2 space-y-2">
                              <div className="flex items-center gap-2">
                                {useJobItems ? (
                                  <select
                                    value={it.name}
                                    onChange={(e) => selectJobItemService(idx, e.target.value)}
                                    className="flex-1 h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
                                  >
                                    <option value="">서비스 선택</option>
                                    {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                ) : (
                                  <input
                                    value={it.name}
                                    onChange={(e) => setJobName(idx, e.target.value)}
                                    placeholder="항목명 (예: 에어컨 청소)"
                                    className="flex-1 h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
                                  />
                                )}
                                {jobItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeJobItem(idx)}
                                    className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-destructive hover:bg-destructive/10"
                                    aria-label="항목 빼기"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  inputMode="numeric"
                                  value={it.qty}
                                  onChange={(e) => setJobQty(idx, digitsOnly(e.target.value))}
                                  className="w-12 h-9 rounded-lg border border-border px-2 text-sm text-center shrink-0"
                                />
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {useJobItems ? `${qtyUnitOf(it.unit)} × ${perLabelOf(it.unit)}` : '×'}
                                </span>
                                <input
                                  inputMode="numeric"
                                  value={formatThousands(it.unitPrice)}
                                  onChange={(e) => setJobUnit(idx, digitsOnly(e.target.value))}
                                  placeholder={useJobItems ? `${perLabelOf(it.unit)} 단가` : '단가'}
                                  className="flex-1 min-w-0 h-9 rounded-lg border border-border px-2.5 text-sm text-right"
                                />
                                <span className="text-xs text-muted-foreground shrink-0">원</span>
                              </div>
                              <div className="flex items-center gap-2 border-t border-dashed border-border pt-1.5">
                                <span className="text-xs text-muted-foreground shrink-0">금액</span>
                                <input
                                  inputMode="numeric"
                                  value={formatThousands(it.amount)}
                                  onChange={(e) => setJobAmount(idx, digitsOnly(e.target.value))}
                                  placeholder="합산 금액"
                                  className="flex-1 min-w-0 h-9 rounded-lg border border-border px-2.5 text-sm text-right font-semibold"
                                />
                                <span className="text-xs text-muted-foreground shrink-0">원</span>
                              </div>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={addJobItem}
                            className="w-full h-9 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors flex items-center justify-center gap-1"
                          >
                            <Plus className="h-4 w-4" /> 항목 추가
                          </button>
                          <div className="flex items-center justify-between px-1">
                            <span className="text-sm font-semibold">합계</span>
                            <span className="text-base font-bold tabular-nums text-primary">
                              {formatThousands(String(jobItemsTotal))}원
                            </span>
                          </div>
                        </div>
                    </div>

                    {/* 2. 날짜·시간 (견적 다음 순서) */}
                    <div className="space-y-1">
                      <Label>작업 날짜·시간 (필수)</Label>
                      <DateTimePicker
                        date={jobDate}
                        time={jobTime}
                        onDateChange={setJobDate}
                        onTimeChange={setJobTime}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 법인 고객 — 정기계약 (선택) */}
            {custIsCompany && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasContract}
                    onChange={(e) => customerForm.setValue('hasContract', e.target.checked ? 'true' : '')}
                    className="accent-primary h-4 w-4"
                  />
                  <span className="text-sm font-medium">정기계약도 같이 등록하기</span>
                </label>
                <p className="text-xs text-muted-foreground -mt-1.5">
                  월 금액·방문 주기를 넣으면 계약으로 등록돼요
                </p>

                {hasContract && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="contract-service">서비스 유형</Label>
                      <select
                        id="contract-service"
                        {...customerForm.register('service_type')}
                        className="w-full h-10 rounded-lg border border-border bg-background px-2.5 text-sm"
                      >
                        <option value="">선택해주세요</option>
                        {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>방문 주기</Label>
                      <FrequencyPicker
                        value={customerForm.watch('frequency') ?? ''}
                        onChange={(val) => customerForm.setValue('frequency', val)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="contract-price">월 계약금액 (필수)</Label>
                      <Input
                        id="contract-price"
                        inputMode="numeric"
                        placeholder="700,000"
                        value={formatThousands(customerForm.watch('contract_price') ?? '')}
                        onChange={(e) => customerForm.setValue('contract_price', digitsOnly(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="contract-start">시작일 (필수)</Label>
                      <Input id="contract-start" type="date" {...customerForm.register('start_date')} />
                    </div>
                  </div>
                )}
              </div>
            )}

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
