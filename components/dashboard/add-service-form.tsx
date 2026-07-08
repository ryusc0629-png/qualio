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
import { createServiceItemAction } from '@/lib/actions/services'
import { Plus, X, Zap, ListPlus, Trash2 } from 'lucide-react'
import { isAcService } from '@/lib/utils'

// 구분 설정에서 빠른 선택 가능한 자주 쓰는 구분 프리셋
const VARIANT_PRESETS = ['신축', '구축', '아파트', '빌라', '오피스텔', '상가']

function VariantSelector({
  variants, onChange, onAdd, newInput, onNewInputChange, onRemove,
}: {
  variants: string[]
  onChange: (v: string[]) => void
  onAdd: () => void
  newInput: string
  onNewInputChange: (v: string) => void
  onRemove: (v: string) => void
}) {
  const toggle = (preset: string) => {
    if (variants.includes(preset)) {
      onChange(variants.filter((v) => v !== preset))
    } else {
      onChange([...variants, preset])
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">구분 설정 (선택) — 신축/구축처럼 단가가 다를 때 사용</p>
      {/* 프리셋 칩 */}
      <div className="flex flex-wrap gap-1.5">
        {VARIANT_PRESETS.map((preset) => {
          const selected = variants.includes(preset)
          return (
            <button
              key={preset}
              type="button"
              onClick={() => toggle(preset)}
              className={[
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
              ].join(' ')}
            >
              {selected && <span className="mr-1">✓</span>}{preset}
            </button>
          )
        })}
      </div>
      {/* 선택된 구분 + 직접 입력 */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {variants.filter((v) => !VARIANT_PRESETS.includes(v)).map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-1 font-medium">
            {v}
            <button type="button" onClick={() => onRemove(v)} className="hover:text-destructive transition-colors">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <Input
            placeholder="직접 입력"
            value={newInput}
            onChange={(e) => onNewInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
            className="h-7 text-xs w-28"
          />
          {newInput.trim() && (
            <Button type="button" variant="outline" size="sm" onClick={onAdd} className="h-7 text-xs px-2">추가</Button>
          )}
        </div>
      </div>
      {variants.length > 0 && (
        <p className="text-[11px] text-muted-foreground">선택된 구분: {variants.join(', ')}</p>
      )}
    </div>
  )
}

// 에어컨 유형 목록 (견적 폼과 동일한 ID 사용)
const AC_TYPE_LIST = [
  { id: 'wall_standard',  label: '벽걸이형', sub: '일반',       placeholder: '75,000' },
  { id: 'wall_baramless', label: '벽걸이형', sub: '무풍',       placeholder: '95,000' },
  { id: 'stand_standard', label: '스탠드형', sub: '일반',       placeholder: '100,000' },
  { id: 'stand_smart',    label: '스탠드형', sub: '스마트·무풍', placeholder: '125,000' },
  { id: 'system_1way',    label: '시스템에어컨', sub: '1way·2way', placeholder: '110,000' },
  { id: 'system_4way',    label: '시스템에어컨', sub: '4way',    placeholder: '130,000' },
  { id: 'commercial',     label: '업소형',   sub: '',           placeholder: '150,000' },
] as const

// 표준 카테고리 목록 (데이터 일관성을 위해 고정값 사용)
const CATEGORIES = [
  '주거 공간',   // 이사/입주/거주 청소
  '가전 케어',   // 에어컨, 세탁기, 냉장고 등
  '특수/시공',   // 줄눈, 나노코팅, 방역 등
  '상업 공간',   // 카페, 식당, 매장
  '사무실',      // 오피스 청소
  '기타',
] as const

// 단위 옵션 (한스클린 등 업계 표준 기준)
const UNITS = [
  { value: '정액', label: '정액 (1회 고정가)' },
  { value: '평당', label: '평당 가격' },
  { value: '개',   label: '대·개당 가격' },
  { value: '시간', label: '시간당 가격' },
  { value: '상담', label: '현장 견적 (방문 후 산출)' },
] as const

type UnitValue = typeof UNITS[number]['value']

// 업계 표준 프리셋 서비스 목록
// 에어컨은 유형별 분리 없이 하나로 통합 — 고객이 견적 폼에서 유형+대수 직접 선택
const PRESETS = [
  { name: '이사 청소',   category: '주거 공간', unit: '평당', base_price: 15000 },
  { name: '입주 청소',   category: '주거 공간', unit: '평당', base_price: 18000 },
  { name: '거주 청소',   category: '주거 공간', unit: '정액', base_price: 80000 },
  { name: '에어컨 청소', category: '가전 케어', unit: '개',   base_price: 80000 },
  { name: '줄눈 시공',   category: '특수/시공', unit: '평당', base_price: 30000 },
] as const

const schema = z.object({
  name: z.string().min(1, '서비스명을 입력해주세요'),
  category: z.string().optional(),
  base_price: z.string().min(1, '금액을 입력해주세요'),
  unit: z.string().min(1, '단위를 선택해주세요'),
})

type FormInput = z.infer<typeof schema>

export function AddServiceForm() {
  const [open, setOpen] = useState(false)
  // 에어컨 유형별 단가 상태 (ID → 원 단위 문자열)
  const [acPrices, setAcPrices] = useState<Partial<Record<string, string>>>({})
  // 항목별 단가 상태
  const [showUnitPrices, setShowUnitPrices] = useState(false)
  const [unitVariants, setUnitVariants] = useState<string[]>([])
  const [newVariantInput, setNewVariantInput] = useState('')
  // variants가 있으면: { variantName: [{name, price}] }, 없으면: [{name, price}] 형태를 variants 키 '' 로 통일
  const [unitItemsByVariant, setUnitItemsByVariant] = useState<Record<string, Array<{ name: string; price: string }>>>({
    '': [{ name: '', price: '' }],
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { unit: '정액', base_price: '0' },
  })

  const { execute, isPending } = useAction(createServiceItemAction, {
    onSuccess: () => {
      toast.success('서비스가 추가됐어요!')
      reset({ unit: '정액', base_price: '0' })
      setAcPrices({})
      setShowUnitPrices(false)
      setUnitVariants([])
      setNewVariantInput('')
      setUnitItemsByVariant({ '': [{ name: '', price: '' }] })
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '서비스 추가에 실패했습니다')
    },
  })

  // 프리셋 클릭 시 모든 필드 자동 채우기
  const applyPreset = (preset: typeof PRESETS[number]) => {
    setValue('name', preset.name)
    setValue('category', preset.category)
    setValue('unit', preset.unit as UnitValue)
    setValue('base_price', String(preset.base_price))
    // 에어컨 프리셋이면 유형별 기본 단가 자동 세팅
    if (isAcService(preset.name)) {
      const defaults: Partial<Record<string, string>> = {}
      AC_TYPE_LIST.forEach((t) => {
        defaults[t.id] = t.placeholder.replace(',', '')
      })
      setAcPrices(defaults)
    } else {
      setAcPrices({})
    }
    setShowUnitPrices(false)
    setUnitVariants([])
    setNewVariantInput('')
    setUnitItemsByVariant({ '': [{ name: '', price: '' }] })
  }

  // 구분(variant) 추가/삭제/토글
  const handleVariantsChange = (next: string[]) => {
    // 새로 추가된 variant에 빈 항목 행 초기화
    setUnitVariants(next)
    setUnitItemsByVariant((prev) => {
      const updated = { ...prev }
      next.forEach((v) => { if (!updated[v]) updated[v] = [{ name: '', price: '' }] })
      return updated
    })
  }
  const addVariant = () => {
    const v = newVariantInput.trim()
    if (!v || unitVariants.includes(v)) return
    handleVariantsChange([...unitVariants, v])
    setNewVariantInput('')
  }
  const removeVariant = (v: string) => {
    handleVariantsChange(unitVariants.filter((x) => x !== v))
    setUnitItemsByVariant((prev) => { const next = { ...prev }; delete next[v]; return next })
  }

  // 항목 추가/수정/삭제 헬퍼 (variant 키 기반)
  const updateUnitItem = (variantKey: string, idx: number, field: 'name' | 'price', value: string) => {
    setUnitItemsByVariant((prev) => ({
      ...prev,
      [variantKey]: (prev[variantKey] ?? []).map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }))
  }
  const addUnitItem = (variantKey: string) => {
    setUnitItemsByVariant((prev) => ({
      ...prev,
      [variantKey]: [...(prev[variantKey] ?? []), { name: '', price: '' }],
    }))
  }
  const removeUnitItem = (variantKey: string, idx: number) => {
    setUnitItemsByVariant((prev) => ({
      ...prev,
      [variantKey]: (prev[variantKey] ?? []).filter((_, i) => i !== idx),
    }))
  }

  const currentUnit = watch('unit')
  const currentName = watch('name') ?? ''
  const isAc        = isAcService(currentName)
  const isUnit      = !isAc && showUnitPrices

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="h-4 w-4 mr-1" />
        서비스 추가
      </Button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit((data) => {
        let acTypePrices: Record<string, number> | undefined
        let unitPrices: Array<{ name: string; price: number }> | undefined
        // 현장 견적(상담)은 미리 가격이 없으므로 0으로 저장
        let basePrice = data.unit === '상담' ? 0 : Number(data.base_price)

        if (isAc) {
          // 에어컨: 유형별 단가에서 최저 단가를 base_price로 설정
          const parsed: Record<string, number> = {}
          let minPrice = Infinity
          for (const [id, val] of Object.entries(acPrices)) {
            const n = Number(val)
            if (n > 0) {
              parsed[id] = n
              if (n < minPrice) minPrice = n
            }
          }
          if (Object.keys(parsed).length > 0) {
            acTypePrices = parsed
            basePrice = minPrice === Infinity ? basePrice : minPrice
          }
        } else if (isUnit) {
          // 항목별 단가: variant 구분 포함하여 변환
          const hasVariants = unitVariants.length > 0
          const allItems: Array<{ name: string; price: number; variant?: string }> = []
          const keys = hasVariants ? unitVariants : ['']
          for (const key of keys) {
            const rows = (unitItemsByVariant[key] ?? []).filter((r) => r.name.trim() && Number(r.price) > 0)
            for (const r of rows) {
              allItems.push(hasVariants
                ? { name: r.name.trim(), price: Number(r.price), variant: key }
                : { name: r.name.trim(), price: Number(r.price) }
              )
            }
          }
          if (allItems.length > 0) {
            unitPrices = allItems
            basePrice = Math.min(...allItems.map((i) => i.price))
          }
        }

        execute({
          ...data,
          base_price:    basePrice,
          ac_type_prices: acTypePrices,
          unit_prices:    unitPrices,
          unit_variants:  unitVariants.length > 0 ? unitVariants : undefined,
        })
      })}
      className="rounded-lg border bg-card p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">새 서비스 추가</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 프리셋 버튼 */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">자주 쓰는 서비스 바로 추가</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-full border px-3 py-1 text-xs hover:bg-accent transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t pt-3 space-y-3">
        {/* 서비스명 */}
        <div className="space-y-1">
          <Label htmlFor="name">서비스명 *</Label>
          <Input id="name" placeholder="예) 가정집 청소" {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        {/* 항목별 단가 토글 (에어컨이 아닐 때만 표시) */}
        {!isAc && (
          <button
            type="button"
            onClick={() => setShowUnitPrices((v) => !v)}
            className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
              showUnitPrices
                ? 'border-primary/40 bg-primary/5 text-primary'
                : 'border-dashed text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <ListPlus className="h-3.5 w-3.5 shrink-0" />
            {showUnitPrices ? '항목별 단가 설정 중 (클릭하면 해제)' : '항목별 단가 설정하기 (예: 화장실 1곳 얼마, 주방 얼마)'}
          </button>
        )}

        {/* 항목별 단가 입력 */}
        {isUnit && (
          <div className="space-y-3">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <ListPlus className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-xs font-bold text-primary">항목별 단가를 설정하면 자동으로 계산됩니다</p>
              </div>
              <p className="text-xs text-primary/80 leading-relaxed">
                고객이 견적 폼에서 항목·수량을 선택하면, 아래 단가를 기준으로 자동 합산됩니다.
              </p>
            </div>

            {/* 구분(신축/구축 등) 설정 */}
            <VariantSelector variants={unitVariants} onChange={setUnitVariants} onAdd={addVariant} newInput={newVariantInput} onNewInputChange={setNewVariantInput} onRemove={removeVariant} />

            {/* 구분이 없으면 단일 항목 목록, 있으면 구분별 항목 목록 */}
            {(unitVariants.length > 0 ? unitVariants : ['']).map((variantKey) => {
              const items = unitItemsByVariant[variantKey] ?? []
              return (
                <div key={variantKey} className="space-y-2">
                  {variantKey && (
                    <p className="text-xs font-semibold text-foreground border-b pb-1">{variantKey}</p>
                  )}
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder="항목명 (예: 화장실)"
                        value={item.name}
                        onChange={(e) => updateUnitItem(variantKey, idx, 'name', e.target.value)}
                        className="h-9 text-sm flex-1"
                      />
                      <div className="relative w-36 shrink-0">
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="50,000"
                          value={item.price ? Number(item.price).toLocaleString('ko-KR') : ''}
                          onChange={(e) => updateUnitItem(variantKey, idx, 'price', e.target.value.replace(/[^0-9]/g, ''))}
                          className="h-9 text-sm pr-6"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
                      </div>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeUnitItem(variantKey, idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addUnitItem(variantKey)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> 항목 추가
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* 에어컨 서비스 안내 + 유형별 단가 입력 */}
        {isAc && (
          <div className="space-y-3">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-xs font-bold text-primary">유형별 단가를 설정하면 자동으로 계산됩니다</p>
              </div>
              <p className="text-xs text-primary/80 leading-relaxed">
                고객이 견적 폼에서 유형·대수를 선택하면, 아래 단가를 기준으로 자동 합산됩니다.
              </p>
            </div>

            {/* 유형별 단가 입력 그리드 */}
            <div className="space-y-2">
              {AC_TYPE_LIST.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="w-36 shrink-0">
                    <p className="text-xs font-semibold text-foreground">{t.label}</p>
                    {t.sub && <p className="text-[11px] text-muted-foreground">{t.sub}</p>}
                  </div>
                  <div className="flex-1 relative">
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder={t.placeholder}
                      value={acPrices[t.id] ? Number(acPrices[t.id]).toLocaleString('ko-KR') : ''}
                      onChange={(e) => setAcPrices((prev) => ({ ...prev, [t.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                      className="h-9 text-sm pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">단가를 비워두면 미제공 유형으로 처리돼요</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* 카테고리 */}
          <div className="space-y-1">
            <Label htmlFor="category">카테고리</Label>
            <select
              id="category"
              {...register('category')}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">선택 안 함</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 단위 */}
          <div className="space-y-1">
            <Label htmlFor="unit">단위 *</Label>
            <select
              id="unit"
              {...register('unit')}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 현장 견적(상담) — 가격 대신 안내만 */}
        {currentUnit === '상담' && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            현장 방문 후 견적이라 미리 가격을 넣지 않아도 돼요. 고객이 이 서비스를 고르면
            연락처를 받아 &lsquo;상담 요청&rsquo;으로 접수되고, 사장님께 알림이 갑니다.
          </p>
        )}

        {/* 기본가 — 에어컨/항목별 단가/현장견적 모드에서는 숨김 */}
        {!isAc && !isUnit && currentUnit !== '상담' && (
          <div className="space-y-1">
            <Label htmlFor="base_price">
              기본 가격 (원) *
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                {currentUnit === '평당' && '— 평당 금액'}
                {currentUnit === '개' && '— 개당 금액'}
                {currentUnit === '시간' && '— 시간당 금액'}
                {currentUnit === '정액' && '— 1회 고정 금액'}
              </span>
            </Label>
            <Input
              id="base_price"
              type="number"
              placeholder={
                currentUnit === '평당' ? '예) 15000' :
                currentUnit === '개' ? '예) 80000' :
                currentUnit === '시간' ? '예) 30000' :
                '예) 80000'
              }
              {...register('base_price')}
            />
            {errors.base_price && (
              <p className="text-xs text-destructive">{errors.base_price.message}</p>
            )}
          </div>
        )}
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
