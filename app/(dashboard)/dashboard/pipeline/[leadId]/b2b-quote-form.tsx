'use client'

import { useState, useTransition, useEffect } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { saveB2bQuoteAction, generateSpecAction } from '@/lib/actions/b2b-quotes'
import { FileText, Plus, Trash2, Sparkles, MapPin, Loader2 } from 'lucide-react'
import { openAddressSearch } from '@/lib/address/postcode'
import {
  AREA_UNITS,
  AREA_UNIT_LABELS,
  parseArea,
  formatArea,
  convertArea,
  areaConversionHint,
  type AreaUnit,
} from '@/lib/utils/area'

interface QuoteItem {
  name: string
  unit: string
  qty: number
  unit_price: number
}

interface ExistingQuote {
  id: string
  quote_number: string | null
  valid_until: string | null
  items: QuoteItem[]
  total_amount: number
  tax_included: boolean
  conditions: string | null
  site_name: string | null
  site_address: string | null
  site_area: string | null
  frequency: string | null
  worker_count: number | null
  spec_content: string | null
  job_type: string | null
}

interface Props {
  // 리드(영업 중) 또는 고객(계약 중) 중 하나에 연결
  leadId?: string
  customerId?: string
  clientName: string
  existingQuote: ExistingQuote | null
}

type JobType = 'recurring' | 'one_off'

const defaultItem = (jobType: JobType = 'recurring'): QuoteItem => ({
  name: '', unit: jobType === 'one_off' ? '식' : '월', qty: 1, unit_price: 0,
})

// 입력된 단위에 맞춰 수량 열 라벨을 자동 조정 (월→개월, 회→횟수 …)
// 시간 반복 단위만 별칭을 쓰고, 면적·개수 등(평·㎡·개·대)은 '수량'으로 통일
// (예전엔 기본값이 '횟수'라 단위가 '평'일 때도 '횟수 40'으로 어색했음)
const UNIT_COUNT_LABEL: Record<string, string> = {
  월: '개월', 개월: '개월', 주: '주', 일: '일', 년: '년', 회: '횟수', 차: '횟수', 번: '횟수',
}
const countLabelForUnit = (unit?: string): string => UNIT_COUNT_LABEL[(unit ?? '').trim()] ?? '수량'

// 시방서 AI 생성 중 보여줄 단계별 진행 문구 (실제 스트리밍은 아니지만 기다림을 덜 답답하게)
const SPEC_STEPS = [
  '현장 정보를 분석하고 있어요',
  '작업 범위와 순서를 정리하는 중',
  '사용 약품·장비를 고르는 중',
  '작업 주기·투입 인원을 반영하는 중',
  '품질 기준을 정리하는 중',
  '거의 다 됐어요, 마무리 중',
]
// 스켈레톤 줄 너비 — 문단·소제목이 섞인 것처럼 보이게
const SPEC_SKELETON = ['w-1/3', 'w-11/12', 'w-10/12', 'w-9/12', 'w-1/4', 'w-11/12', 'w-8/12', 'w-10/12', 'w-1/3', 'w-9/12']

export function B2bQuoteForm({ leadId, customerId, clientName, existingQuote }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  // 미리보기(인쇄) 경로 — 고객이면 고객 경로, 아니면 리드 경로
  const printHref = customerId
    ? `/dashboard/clients/${customerId}/quote/print`
    : `/dashboard/pipeline/${leadId}/quote/print`

  const today = new Date().toISOString().slice(0, 10)
  const defaultQuoteNumber = `Q-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`

  const [quoteNumber, setQuoteNumber] = useState(existingQuote?.quote_number ?? defaultQuoteNumber)
  const [validUntil, setValidUntil] = useState(existingQuote?.valid_until ?? '')
  const [items, setItems] = useState<QuoteItem[]>(
    existingQuote?.items && (existingQuote.items as QuoteItem[]).length > 0
      ? (existingQuote.items as QuoteItem[])
      : [defaultItem()]
  )
  const [taxIncluded, setTaxIncluded] = useState(existingQuote?.tax_included ?? false)
  const [conditions, setConditions] = useState(existingQuote?.conditions ?? '')
  const [siteName, setSiteName] = useState(existingQuote?.site_name ?? '')
  const [siteAddress, setSiteAddress] = useState(existingQuote?.site_address ?? '')
  const initialArea = parseArea(existingQuote?.site_area)
  const [areaValue, setAreaValue] = useState(initialArea.value)
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(initialArea.unit)
  // 저장/전송용 합친 문자열 + 다른 단위 환산 안내
  const siteArea = formatArea(areaValue, areaUnit)
  const areaHint = areaConversionHint(areaValue, areaUnit)

  // 단위를 바꾸면 입력된 숫자도 함께 환산해 의미 보존 (450평 → 1,488㎡)
  const handleAreaUnitChange = (next: AreaUnit) => {
    setAreaValue((v) => convertArea(v, areaUnit, next))
    setAreaUnit(next)
  }
  const [frequency, setFrequency] = useState(existingQuote?.frequency ?? '')
  const [workerCount, setWorkerCount] = useState(existingQuote?.worker_count?.toString() ?? '')
  const [specContent, setSpecContent] = useState(existingQuote?.spec_content ?? '')
  const [jobType, setJobType] = useState<JobType>(existingQuote?.job_type === 'one_off' ? 'one_off' : 'recurring')
  const isOneOff = jobType === 'one_off'

  // 금액 입력 방식: itemized(수량×단가) vs lump(총액 직접 — 월 정기 등 정액 계약)
  // 저장 구조는 동일(항목 배열+총액). lump은 각 줄 수량을 1로 두고 '금액'만 입력.
  // 기존 견적은 모든 수량이 1이면 총액 방식으로 복원(숫자는 어느 쪽이든 동일)
  const [amountMode, setAmountMode] = useState<'itemized' | 'lump'>(
    existingQuote && (existingQuote.items as QuoteItem[] | undefined)?.length
      && (existingQuote.items as QuoteItem[]).every((it) => (it.qty ?? 1) === 1)
      ? 'lump'
      : 'itemized'
  )
  const isLump = amountMode === 'lump'
  // 총액 방식으로 바꾸면 각 줄 수량을 1로 고정(금액=단가로 그대로 합산됨)
  const switchAmountMode = (mode: 'itemized' | 'lump') => {
    if (mode === 'lump') setItems((prev) => prev.map((it) => ({ ...it, qty: 1 })))
    setAmountMode(mode)
  }

  const subtotal = items.reduce((s, it) => s + it.qty * it.unit_price, 0)
  const tax = taxIncluded ? Math.floor(subtotal * 0.1) : 0
  const total = subtotal + tax

  const { execute: executeSave, isPending: saving } = useAction(saveB2bQuoteAction, {
    onSuccess: () => {
      toast.success('저장됐어요!')
      setOpen(false)
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: executeGenSpec, isPending: generatingSpec } = useAction(generateSpecAction, {
    onSuccess: ({ data }) => {
      if (data?.specContent) {
        setSpecContent(data.specContent)
        toast.success('시방서 초안을 만들었어요! 검토 후 수정하세요')
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'AI 생성에 실패했습니다'),
  })

  // 생성 중 진행 문구를 2.2초마다 다음 단계로 넘김 (마지막 단계에서 멈춤)
  const [specStep, setSpecStep] = useState(0)
  useEffect(() => {
    if (!generatingSpec) { setSpecStep(0); return }
    setSpecStep(0)
    const id = setInterval(() => setSpecStep((s) => Math.min(s + 1, SPEC_STEPS.length - 1)), 2200)
    return () => clearInterval(id)
  }, [generatingSpec])

  const updateItem = (idx: number, key: keyof QuoteItem, val: string | number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it))
  }

  const handleSave = () => {
    executeSave({
      leadId,
      customerId,
      quoteNumber:  quoteNumber || undefined,
      validUntil:   validUntil || undefined,
      items:        items.filter((it) => it.name),
      totalAmount:  total,
      taxIncluded,
      conditions:   conditions || undefined,
      siteName:     siteName || undefined,
      siteAddress:  siteAddress || undefined,
      siteArea:     siteArea || undefined,
      frequency:    isOneOff ? undefined : (frequency || undefined),
      workerCount:  workerCount ? Number(workerCount) : undefined,
      specContent:  specContent || undefined,
      jobType,
    })
  }

  const handleGenerateSpec = () => {
    executeGenSpec({
      leadId,
      customerId,
      clientName,
      siteName:     siteName || undefined,
      siteAddress:  siteAddress || undefined,
      siteArea:     siteArea || undefined,
      frequency:    isOneOff ? undefined : (frequency || undefined),
      workerCount:  workerCount ? Number(workerCount) : undefined,
      serviceItems: items.filter((it) => it.name).map((it) => it.name),
      conditions:   conditions || undefined,
      jobType,
    })
  }

  const handlePreview = () => {
    handleSave()
    window.open(printHref, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          {existingQuote ? '견적서 수정' : '견적서 만들기'}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>견적서 + 시방서</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">

          {/* 작업 유형 — 정기 계약 vs 일회성 작업 (청소 주기는 정기에만 해당) */}
          <section className="space-y-2">
            <Label className="text-xs">작업 유형</Label>
            <div className="grid grid-cols-2 gap-2">
              {([['recurring', '정기 계약', '매주·매월 반복 방문'], ['one_off', '일회성 작업', '준공청소·외벽청소 등 1회']] as [JobType, string, string][]).map(([val, label, desc]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setJobType(val)}
                  className={`rounded-lg border p-3 text-left transition-colors ${jobType === val ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted'}`}
                >
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </section>

          {/* 견적서 기본 정보 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">견적 정보</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">견적 번호</Label>
                <Input value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">유효 기간</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-1 h-9" />
              </div>
            </div>
          </section>

          {/* 견적 항목 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">견적 항목</h3>

            {/* 금액 입력 방식 — 항목별(수량×단가) vs 총액 직접(월 정기 등 정액) */}
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
              {([
                ['itemized', '항목별 계산', '수량 × 단가'],
                ['lump', '총액 직접 입력', '월 정기 등 정액'],
              ] as ['itemized' | 'lump', string, string][]).map(([mode, label, desc]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => switchAmountMode(mode)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-center text-xs transition-colors ${
                    amountMode === mode ? 'bg-white shadow-sm font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                  <span className="block text-[10px] text-muted-foreground/70">{desc}</span>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className={isLump ? 'col-span-5' : 'col-span-4'}>
                    {idx === 0 && <Label className="text-xs">서비스 내용</Label>}
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem(idx, 'name', e.target.value)}
                      placeholder={isLump ? '예: 월 정기 미화관리' : '예: 사무실 정기청소'}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs">단위</Label>}
                    <Input
                      value={item.unit}
                      onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                      placeholder="월"
                      className="mt-1 h-9"
                    />
                  </div>
                  {!isLump && (
                    <div className="col-span-2">
                      {idx === 0 && <Label className="text-xs">{countLabelForUnit(items[0]?.unit)}</Label>}
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={item.qty || ''}
                        onChange={(e) => updateItem(idx, 'qty', Number(e.target.value.replace(/[^0-9]/g, '')))}
                        placeholder="1"
                        className="mt-1 h-9"
                      />
                    </div>
                  )}
                  <div className={isLump ? 'col-span-4' : 'col-span-3'}>
                    {idx === 0 && <Label className="text-xs">{isLump ? '금액 (원)' : '단가 (원)'}</Label>}
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item.unit_price || ''}
                      onChange={(e) => updateItem(idx, 'unit_price', Number(e.target.value.replace(/[^0-9]/g, '')))}
                      placeholder={isLump ? '2500000' : '700000'}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {idx === 0 && <div className="text-xs invisible">X</div>}
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}
                      className="mt-1 p-2 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setItems((prev) => [...prev, defaultItem(jobType)])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              항목 추가
            </Button>

            {/* 합계 */}
            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">소계</span>
                <span>{subtotal.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxIncluded}
                    onChange={(e) => setTaxIncluded(e.target.checked)}
                    className="rounded"
                  />
                  부가세 (10%) 포함
                </label>
                {taxIncluded && <span className="text-sm">{tax.toLocaleString()}원</span>}
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-1.5">
                <span>합계</span>
                <span className="text-primary">{total.toLocaleString()}원</span>
              </div>
            </div>

            <div>
              <Label className="text-xs">계약 조건 및 특이사항</Label>
              <Textarea
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="예: 월별 후불 결제, 서버실 출입 불가"
                rows={2}
                className="mt-1 resize-none"
              />
            </div>
          </section>

          {/* 현장 정보 (시방서용) */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">현장 정보 (시방서용)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">현장명</Label>
                <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="예: (주)한국빌딩 강남사옥" className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">면적</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={areaValue}
                    onChange={(e) => setAreaValue(e.target.value)}
                    placeholder="예: 450"
                    className="h-9"
                  />
                  <select
                    value={areaUnit}
                    onChange={(e) => handleAreaUnitChange(e.target.value as AreaUnit)}
                    className="h-9 shrink-0 rounded-md border border-input bg-white px-2 text-sm"
                    aria-label="면적 단위"
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>
                    ))}
                  </select>
                </div>
                {areaHint && <p className="mt-1 text-[11px] text-muted-foreground">{areaHint}</p>}
              </div>
            </div>
            <div>
              <Label className="text-xs">현장 주소</Label>
              <div className="mt-1 flex gap-2">
                <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="주소 찾기를 누르거나 직접 입력" className="flex-1 h-9" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-9"
                  onClick={() => openAddressSearch((addr) => setSiteAddress(addr))}
                >
                  <MapPin className="h-3.5 w-3.5 mr-1" />
                  주소 찾기
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {!isOneOff && (
                <div>
                  <Label className="text-xs">청소 주기</Label>
                  <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="예: 주 3회 (월수금)" className="mt-1 h-9" />
                </div>
              )}
              <div>
                <Label className="text-xs">투입 인원</Label>
                <Input
                  value={workerCount}
                  onChange={(e) => setWorkerCount(e.target.value)}
                  placeholder="예: 2"
                  inputMode="numeric"
                  className="mt-1 h-9"
                />
              </div>
            </div>
          </section>

          {/* 시방서 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">시방서</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={handleGenerateSpec}
                disabled={generatingSpec || items.filter((it) => it.name).length === 0}
              >
                {generatingSpec
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                {generatingSpec ? 'AI가 작성 중이에요...' : 'AI로 초안 만들기'}
              </Button>
            </div>
            {generatingSpec ? (
              // 생성 중 — 글이 써지는 듯한 스켈레톤 + 단계별 진행 문구로 기다림을 덜 답답하게
              <div className="rounded-md border border-input bg-muted/20 p-4 min-h-[240px] space-y-4" aria-live="polite">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{SPEC_STEPS[specStep]}…</span>
                </div>
                <div className="space-y-2.5">
                  {SPEC_SKELETON.map((w, i) => (
                    <div
                      key={i}
                      className={`h-3 rounded bg-muted animate-pulse ${w}`}
                      style={{ animationDelay: `${i * 90}ms` }}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">현장 정보에 맞춰 시방서를 작성하고 있어요. 잠시만요…</p>
              </div>
            ) : (
              <Textarea
                value={specContent}
                onChange={(e) => setSpecContent(e.target.value)}
                placeholder="위 현장 정보를 입력 후 'AI로 초안 만들기'를 누르거나, 직접 작성하세요"
                rows={10}
                className="resize-none font-mono text-xs leading-relaxed"
              />
            )}
          </section>

          {/* 버튼 */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 h-12" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장만 하기'}
            </Button>
            <Button className="flex-1 h-12" onClick={handlePreview} disabled={saving}>
              <FileText className="h-4 w-4 mr-1.5" />
              저장 후 미리보기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
