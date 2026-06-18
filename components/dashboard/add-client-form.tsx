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
import { FrequencyPicker } from '@/components/dashboard/frequency-picker'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { createLeadAction } from '@/lib/actions/crm'
import { createActiveCustomerAction } from '@/lib/actions/customers'
import { Plus, X, Search } from 'lucide-react'

// 카카오(다음) 주소 검색 — 우편번호 스크립트 동적 로드
declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: { address: string; buildingName: string; addressType: string; bname: string }) => void
        onclose?: () => void
      }) => { open: () => void }
    }
  }
}

function openAddressSearch(onSelect: (address: string) => void) {
  const run = () => {
    new window.daum!.Postcode({
      oncomplete: (data) => {
        const extra = data.buildingName ? ` (${data.buildingName})` : ''
        onSelect(data.address + extra)
      },
    }).open()
  }

  if (window.daum?.Postcode) { run(); return }

  const script = document.createElement('script')
  script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
  script.onload = run
  document.head.appendChild(script)
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

interface AddClientFormProps {
  // 사이드바 '서비스 항목'에 등록된 서비스명 (없으면 기본값 사용)
  serviceNames?: string[]
}

const DEFAULT_SERVICES = ['일반청소', '입주청소', '사무실 청소', '공장 청소', '기타']

export function AddClientForm({ serviceNames = [] }: AddClientFormProps) {
  // 등록된 서비스가 있으면 그걸 쓰고, 없으면 기본값 — 마지막에 '기타' 보장
  const services = serviceNames.length > 0
    ? [...serviceNames, '기타']
    : DEFAULT_SERVICES
  const [open, setOpen] = useState(false)
  const [clientType, setClientType] = useState<'lead' | 'customer'>('lead')
  // 첫 작업 일정 — 다른 설정 창과 동일한 달력+시/분 선택 방식
  const [jobDate, setJobDate] = useState('')
  const [jobTime, setJobTime] = useState('09:00')

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
      setJobTime('09:00')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const isPending = leadPending || customerPending

  // 업종 노출 여부 — 법인 고객일 때만 (개인은 업종 의미 없음)
  const leadIsCompany = leadForm.watch('customer_type') === 'company'
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
    setJobTime('09:00')
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
              <Label htmlFor="lead-name">업체명 (필수)</Label>
              <Input id="lead-name" placeholder="강남 웰니스 카페" {...leadForm.register('company_name')} />
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
                <Input id="lead-phone" placeholder="010-1234-5678" inputMode="tel" {...leadForm.register('phone')} />
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
                <Input id="lead-address" placeholder="주소 검색을 눌러주세요" {...leadForm.register('address')} />
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
            onSubmit={customerForm.handleSubmit((data) =>
              executeCustomer({
                ...data,
                job_scheduled_at: jobDate ? `${jobDate}T${jobTime}:00+09:00` : '',
              })
            )}
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
                <Input id="cust-phone" placeholder="010-1234-5678" inputMode="tel" {...customerForm.register('phone')} />
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
                <Input id="cust-address" placeholder="주소 검색을 눌러주세요" {...customerForm.register('address')} />
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
                    <div className="space-y-1">
                      <Label htmlFor="job-service">서비스명</Label>
                      <select
                        id="job-service"
                        {...customerForm.register('job_service')}
                        className="w-full h-10 rounded-lg border border-border bg-background px-2.5 text-sm"
                      >
                        <option value="">선택 안함</option>
                        {services.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>작업 날짜·시간 (필수)</Label>
                      <DateTimePicker
                        date={jobDate}
                        time={jobTime}
                        onDateChange={setJobDate}
                        onTimeChange={setJobTime}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="job-price">작업 금액 (필수)</Label>
                      <Input id="job-price" inputMode="numeric" placeholder="150000" {...customerForm.register('job_price')} />
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
                        {services.map((s) => <option key={s} value={s}>{s}</option>)}
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
                      <Input id="contract-price" inputMode="numeric" placeholder="700000" {...customerForm.register('contract_price')} />
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
