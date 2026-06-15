'use client'

import { useState, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { updateServiceItemAction } from '@/lib/actions/services'
import { createClient } from '@/lib/supabase/client'
import { Pencil, X, ImagePlus, Loader2, Zap, ListPlus, Trash2, Plus } from 'lucide-react'
import { isAcService } from '@/lib/utils'

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

const CATEGORIES = ['주거 공간', '가전 케어', '특수/시공', '상업 공간', '사무실', '기타'] as const
const UNITS = [
  { value: '정액', label: '정액 (1회 고정가)' },
  { value: '평당', label: '평당 가격' },
  { value: '개',   label: '대·개당 가격' },
  { value: '시간', label: '시간당 가격' },
] as const

const AC_TYPE_LIST = [
  { id: 'wall_standard',  label: '벽걸이형',     sub: '일반',       placeholder: '75000' },
  { id: 'wall_baramless', label: '벽걸이형',     sub: '무풍',       placeholder: '95000' },
  { id: 'stand_standard', label: '스탠드형',     sub: '일반',       placeholder: '100000' },
  { id: 'stand_smart',    label: '스탠드형',     sub: '스마트·무풍', placeholder: '125000' },
  { id: 'system_1way',    label: '시스템에어컨', sub: '1way·2way',  placeholder: '110000' },
  { id: 'system_4way',    label: '시스템에어컨', sub: '4way',       placeholder: '130000' },
  { id: 'commercial',     label: '업소형',       sub: '',           placeholder: '150000' },
] as const

const schema = z.object({
  name:       z.string().min(1, '서비스명을 입력해주세요'),
  category:   z.string().optional(),
  base_price: z.string().min(1, '금액을 입력해주세요'),
  unit:       z.string().min(1),
})

type FormInput = z.infer<typeof schema>

interface EditServiceButtonProps {
  service: {
    id: string
    name: string
    category: string | null
    base_price: number
    unit: string
    photos: string[] | null
    ac_type_prices: Record<string, number> | null
    unit_prices: Array<{ name: string; price: number; variant?: string }> | null
    unit_variants: string[] | null
    tier_good_items: string[]
    tier_better_items: string[]
    tier_best_items: string[]
  }
}

// 플랜 항목 입력 컴포넌트
function TierItemsEditor({
  label,
  placeholder,
  items,
  onChange,
}: {
  label: string
  placeholder: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [inputVal, setInputVal] = useState('')

  const add = useCallback(() => {
    const v = inputVal.trim()
    if (!v) return
    onChange([...items, v])
    setInputVal('')
  }, [inputVal, items, onChange])

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-zinc-700">{label}</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="flex-1 bg-zinc-50 border rounded-lg px-3 py-1.5 text-xs text-zinc-700">{item}</div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="shrink-0 p-1 hover:text-destructive transition-colors"
          >
            <X className="h-3.5 w-3.5 text-zinc-400" />
          </button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <Input
          placeholder={placeholder}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          className="h-8 text-xs"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} className="h-8 shrink-0 text-xs px-3">
          추가
        </Button>
      </div>
    </div>
  )
}

export function EditServiceButton({ service }: EditServiceButtonProps) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<string[]>(service.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tierGood,   setTierGood]   = useState<string[]>(service.tier_good_items)
  const [tierBetter, setTierBetter] = useState<string[]>(service.tier_better_items)
  const [tierBest,   setTierBest]   = useState<string[]>(service.tier_best_items)
  // 에어컨 유형별 단가 상태 (기존 값으로 초기화)
  const [acPrices, setAcPrices] = useState<Partial<Record<string, string>>>(() => {
    const init: Partial<Record<string, string>> = {}
    if (service.ac_type_prices) {
      for (const [k, v] of Object.entries(service.ac_type_prices)) {
        init[k] = String(v)
      }
    }
    return init
  })
  // 항목별 단가 상태 (기존 값으로 초기화)
  const [showUnitPrices, setShowUnitPrices] = useState(() =>
    Array.isArray(service.unit_prices) && service.unit_prices.length > 0
  )
  const [unitVariants, setUnitVariants] = useState<string[]>(() =>
    Array.isArray(service.unit_variants) ? service.unit_variants : []
  )
  const [newVariantInput, setNewVariantInput] = useState('')
  const [unitItemsByVariant, setUnitItemsByVariant] = useState<Record<string, Array<{ name: string; price: string }>>>(() => {
    if (!Array.isArray(service.unit_prices) || service.unit_prices.length === 0) {
      return { '': [{ name: '', price: '' }] }
    }
    const hasVariants = Array.isArray(service.unit_variants) && service.unit_variants.length > 0
    if (!hasVariants) {
      return { '': service.unit_prices.map((i) => ({ name: i.name, price: String(i.price) })) }
    }
    const map: Record<string, Array<{ name: string; price: string }>> = {}
    for (const v of service.unit_variants ?? []) map[v] = []
    for (const item of service.unit_prices) {
      const key = item.variant ?? ''
      if (!map[key]) map[key] = []
      map[key].push({ name: item.name, price: String(item.price) })
    }
    return map
  })

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:       service.name,
      category:   service.category ?? '',
      base_price: String(service.base_price),
      unit:       service.unit,
    },
  })

  const currentName  = watch('name') ?? ''
  const isAcByName   = isAcService(currentName)
  const isUnitByName = !isAcByName && showUnitPrices

  const handleVariantsChange = (next: string[]) => {
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

  const { execute, isPending } = useAction(updateServiceItemAction, {
    onSuccess: () => {
      toast.success('서비스가 수정됐어요!')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '수정에 실패했습니다'),
  })

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (photos.length + files.length > 3) {
      toast.error('사진은 최대 3장까지 등록할 수 있어요')
      return
    }

    setUploading(true)
    const supabase = createClient()
    const newUrls: string[] = []

    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${service.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('service-photos').upload(path, file, { upsert: true })
      if (error) {
        toast.error('사진 업로드에 실패했어요')
        continue
      }
      const { data: { publicUrl } } = supabase.storage.from('service-photos').getPublicUrl(path)
      newUrls.push(publicUrl)
    }

    setPhotos((prev) => [...prev, ...newUrls])
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePhoto = (url: string) => setPhotos((prev) => prev.filter((p) => p !== url))

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="h-8 w-8 p-0">
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>서비스 수정</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSubmit((data) => {
              let acTypePrices: Record<string, number> | undefined
              let unitPrices: Array<{ name: string; price: number }> | undefined
              let basePrice = Number(data.base_price)

              if (isAcByName) {
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
              } else if (isUnitByName) {
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
                id:                service.id,
                name:              data.name,
                category:          data.category || undefined,
                base_price:        basePrice,
                unit:              data.unit,
                photos,
                ac_type_prices:    acTypePrices,
                unit_prices:       unitPrices,
                unit_variants:     unitVariants.length > 0 ? unitVariants : undefined,
                tier_good_items:   tierGood.filter(Boolean),
                tier_better_items: tierBetter.filter(Boolean),
                tier_best_items:   tierBest.filter(Boolean),
              })
            })}
            className="space-y-4"
          >
            {/* 서비스명 */}
            <div className="space-y-1">
              <Label>서비스명 *</Label>
              <Input {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* 카테고리 */}
              <div className="space-y-1">
                <Label>카테고리</Label>
                <select {...register('category')} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                  <option value="">선택 안 함</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* 단위 */}
              <div className="space-y-1">
                <Label>단위 *</Label>
                <select {...register('unit')} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                  {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>

            {/* 항목별 단가 토글 (에어컨이 아닐 때만) */}
            {!isAcByName && (
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
            {isUnitByName && (
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

                <VariantSelector variants={unitVariants} onChange={handleVariantsChange} onAdd={addVariant} newInput={newVariantInput} onNewInputChange={setNewVariantInput} onRemove={removeVariant} />

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

            {/* 기본가 — 에어컨/항목별 단가 모드에서는 자동 계산 */}
            {!isAcByName && !isUnitByName && (
              <div className="space-y-1">
                <Label>기본 가격 (원) *</Label>
                <Input type="number" {...register('base_price')} />
                {errors.base_price && <p className="text-xs text-destructive">{errors.base_price.message}</p>}
              </div>
            )}

            {/* 에어컨 유형별 단가 */}
            {isAcByName && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                  <Label className="text-primary">유형별 단가 설정</Label>
                </div>
                {AC_TYPE_LIST.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div className="w-32 shrink-0">
                      <p className="text-xs font-semibold">{t.label}</p>
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
                <p className="text-[11px] text-muted-foreground">단가를 비워두면 미제공 유형으로 처리돼요</p>
              </div>
            )}

            {/* 사진 업로드 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>견적 페이지에 보여줄 사진 (최대 3장)</Label>
                <span className="text-xs text-muted-foreground">{photos.length}/3</span>
              </div>
              <p className="text-xs text-muted-foreground">
                사진이 있으면 고객 견적 랜딩 페이지에 자동으로 표시됩니다
              </p>

              {/* 사진 미리보기 */}
              <div className="flex gap-2 flex-wrap">
                {photos.map((url) => (
                  <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="서비스 사진" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(url)}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}

                {/* 추가 버튼 */}
                {photos.length < 3 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-1 hover:border-primary transition-colors disabled:opacity-50"
                  >
                    {uploading
                      ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      : <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    }
                    <span className="text-[10px] text-muted-foreground">사진 추가</span>
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            {/* 플랜 구성 항목 */}
            <div className="space-y-4 border-t pt-4">
              <div>
                <p className="text-sm font-semibold">플랜 구성 항목 설정</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  입력하시면 견적서에 정확한 포함 항목이 표시됩니다. 비워두면 AI가 자동으로 채웁니다.
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  ✏️ 짧은 명사형으로 입력해주세요 — &ldquo;필터 세척&rdquo; O, &ldquo;필터를 세척해드립니다&rdquo; X
                </p>
              </div>
              <TierItemsEditor
                label="기본 플랜 항목"
                placeholder="예: 필터 세척"
                items={tierGood}
                onChange={setTierGood}
              />
              <TierItemsEditor
                label="추천 플랜 추가 항목 (기본 포함 + 이것만 추가)"
                placeholder="예: 열교환기 세척"
                items={tierBetter}
                onChange={setTierBetter}
              />
              <TierItemsEditor
                label="프리미엄 플랜 추가 항목 (추천 포함 + 이것만 추가)"
                placeholder="예: 항균 코팅"
                items={tierBest}
                onChange={setTierBest}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" size="sm" disabled={isPending || uploading}>
                {isPending ? '저장 중...' : '저장하기'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
