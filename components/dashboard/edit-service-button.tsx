'use client'

import { useState, useCallback } from 'react'
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
import { Pencil, X, Zap, ListPlus, Trash2, Plus, Users, Check } from 'lucide-react'
import { VolumeTierEditor, toVolumeTiers, toVolumeTierRows, type VolumeTierRow } from '@/components/dashboard/volume-tier-editor'
import { getApplianceTypes, isApplianceService } from '@/lib/utils'
import { getTemplatesForService, type QuoteTemplate } from '@/lib/config/quote-templates'
import { BETTER_UPLIFT_BAND, MIN_PREMIUM_GAP_PCT, type PricingBenchmark } from '@/lib/benchmarks/pricing-band'

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
            // onMouseDown preventDefault: 입력창 포커스를 떼지 않아 맥북에서 첫 클릭이 삼켜지는 문제 방지
            <Button type="button" variant="outline" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={onAdd} className="h-7 text-xs px-2">추가</Button>
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
  { value: '상담', label: '현장 견적 (방문 후 산출)' },
] as const

// 에어컨·냉장고 등 유형별 단가 프리셋은 lib/utils.ts(APPLIANCE_PRESETS)에서 관리

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
    ac_type_prices: Record<string, number> | null
    unit_prices: Array<{ name: string; price: number; variant?: string }> | null
    unit_variants: string[] | null
    volume_tiers?: Array<{ min_size: number; price: number }> | null
    tier_good_items: string[]
    tier_better_items: string[]
    tier_best_items: string[]
    tier_good_discount_rate?: number | null
    tier_good_discount_amount?: number | null
    tier_better_discount_rate?: number | null
    tier_better_discount_amount?: number | null
    tier_best_discount_rate?: number | null
    tier_best_discount_amount?: number | null
    tier_good_price?: number | null
    tier_better_price?: number | null
    tier_best_price?: number | null
  }
  // 같은 업체의 다른 서비스 목록 — 플랜에 끌어올 수 있게
  availableServices?: { id: string; name: string }[]
  // 플랜 배수 (기본가 대비) — 예시 가격 계산용
  tierMultipliers?: { good: number; better: number; best: number }
  // 객단가 상위 업체 실집계 (매일 갱신) — 표본 미달이면 null 이라 문구가 숨겨진다
  pricingBenchmark?: PricingBenchmark | null
}

// 플랜 항목 입력 컴포넌트
// 플랜 단계별 색상 — tier-bundle-editor와 통일 (기본=회색, 추천=에메랄드, 프리미엄=보라)
const TIER_TONE = {
  good:   { card: 'border-slate-200 bg-slate-50',     dot: 'bg-slate-400',   badge: 'bg-slate-200 text-slate-700' },
  better: { card: 'border-emerald-200 bg-emerald-50', dot: 'bg-emerald-500', badge: 'bg-emerald-200 text-emerald-800' },
  best:   { card: 'border-purple-200 bg-purple-50',   dot: 'bg-purple-500',  badge: 'bg-purple-200 text-purple-800' },
} as const

function TierItemsEditor({
  tone,
  title,
  badge,
  hint,
  placeholder,
  items,
  onChange,
  pullServices = [],
  examplePrice,
  priceValue,
  onPriceChange,
  autoPrice,
  unitSuffix = '',
}: {
  tone: keyof typeof TIER_TONE
  title: string
  badge: string
  hint?: string
  placeholder: string
  items: string[]
  onChange: (items: string[]) => void
  pullServices?: { id: string; name: string }[]   // 끌어올 수 있는 다른 서비스
  examplePrice?: number                            // 이 플랜 실효 가격 (헤더 표시)
  priceValue?: string                              // 직접 입력 가격 (추천·프리미엄만; 없으면 기본가 기준)
  onPriceChange?: (v: string) => void
  autoPrice?: number                               // 자동 제안가 (placeholder·기본 안내용)
  unitSuffix?: string                              // '/평' 등 단위 접미사
}) {
  const [inputVal, setInputVal] = useState('')
  const t = TIER_TONE[tone]

  // 중복 없이 항목 추가 (직접 입력·다른 서비스 공통)
  const addItem = useCallback((raw: string) => {
    const v = raw.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v])
  }, [items, onChange])

  const add = useCallback(() => {
    addItem(inputVal)
    setInputVal('')
  }, [inputVal, addItem])

  // 아직 안 담긴 서비스만 드롭다운에 노출
  const pickable = pullServices.filter((s) => !items.includes(s.name))

  return (
    <div className={`rounded-xl border ${t.card} p-3.5 space-y-2`}>
      {/* 단계 헤더 */}
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
        <p className="text-sm font-bold text-zinc-800">{title}</p>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${t.badge}`}>{badge}</span>
        {examplePrice !== undefined && examplePrice > 0 && (
          <span className="ml-auto text-sm font-bold text-zinc-800 tabular-nums">
            {examplePrice.toLocaleString()}원~
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground -mt-0.5">{hint}</p>}

      {/* 이 플랜 가격 — 추천·프리미엄은 직접 입력, 기본은 기본가와 동일 */}
      {onPriceChange ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground shrink-0">이 플랜 가격</span>
          <div className="flex items-center gap-0.5">
            <Input
              type="number" inputMode="numeric" min={0}
              value={priceValue ?? ''}
              onChange={(e) => onPriceChange(e.target.value)}
              placeholder={autoPrice ? String(autoPrice) : '0'}
              className="h-8 w-24 text-xs text-right bg-white px-1.5"
            />
            <span className="text-[11px] text-muted-foreground">원{unitSuffix}</span>
          </div>
          {/* 이 안내가 "비워둬도 그 금액으로 팔린다"로 읽히면 안 된다 —
              추천·프리미엄이 통째로 비어 있으면 3단계 자체가 안 나간다. 조건을 함께 적는다. */}
          {autoPrice ? (
            <span className="text-[10px] text-muted-foreground">
              항목을 넣으면 자동 {autoPrice.toLocaleString()}원{unitSuffix}
            </span>
          ) : null}
        </div>
      ) : (
        autoPrice ? (
          <p className="text-[11px] text-muted-foreground">
            가격: 기본가와 동일 · {autoPrice.toLocaleString()}원{unitSuffix}
          </p>
        ) : null
      )}

      {/* 항목 칩 (흰 배경으로 채도 대비) */}
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {/* 이미 입력한 항목도 그 자리에서 바로 수정 가능 */}
              <Input
                value={item}
                onChange={(e) => onChange(items.map((it, j) => (j === i ? e.target.value : it)))}
                placeholder={placeholder}
                className="flex-1 h-8 text-xs bg-white"
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="shrink-0 p-1 hover:text-destructive transition-colors"
                aria-label="항목 삭제"
              >
                <X className="h-3.5 w-3.5 text-zinc-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 다른 서비스에서 끌어오기 */}
      {pickable.length > 0 && (
        <select
          value=""
          onChange={(e) => { if (e.target.value) addItem(e.target.value) }}
          className="w-full h-8 text-xs bg-white border border-zinc-200 rounded-md px-2 text-zinc-600"
          aria-label="다른 서비스에서 가져오기"
        >
          <option value="">＋ 다른 서비스에서 가져오기</option>
          {pickable.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      )}

      {/* 직접 작성 */}
      <div className="flex gap-1.5">
        <Input
          placeholder={placeholder}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          className="h-8 text-xs bg-white"
        />
        <Button type="button" variant="outline" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={add} className="h-8 shrink-0 text-xs px-3 bg-white">
          추가
        </Button>
      </div>
    </div>
  )
}

export function EditServiceButton({
  service,
  availableServices = [],
  tierMultipliers = { good: 1.0, better: 1.2, best: 1.5 },
  pricingBenchmark = null,
}: EditServiceButtonProps) {
  // 현재 서비스를 제외한 나머지 — 플랜에 끌어올 수 있는 후보
  const otherServices = availableServices.filter((s) => s.id !== service.id)
  const [open, setOpen] = useState(false)
  const [tierGood,   setTierGood]   = useState<string[]>(service.tier_good_items)
  const [tierBetter, setTierBetter] = useState<string[]>(service.tier_better_items)
  const [tierBest,   setTierBest]   = useState<string[]>(service.tier_best_items)
  // 플랜별 직접 가격 (원/평). 비워두면 기본가×배수 자동. 기본 플랜은 기본가와 동일이라 별도 입력 없음
  const numStr = (v: number | null | undefined) => (v ? String(v) : '')
  const [tierBetterPrice, setTierBetterPrice] = useState(numStr(service.tier_better_price))
  const [tierBestPrice,   setTierBestPrice]   = useState(numStr(service.tier_best_price))
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
  // 규모 구간별 단가 (기존 값으로 초기화)
  const [volumeRows, setVolumeRows] = useState<VolumeTierRow[]>(() => toVolumeTierRows(service.volume_tiers))
  const [showVolumeTiers, setShowVolumeTiers] = useState(() => volumeRows.length > 0)
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
  const currentUnit  = watch('unit')
  const applianceTypes = getApplianceTypes(currentName)
  const isAcByName     = isApplianceService(currentName)  // 가전(에어컨·냉장고 등) 유형별 단가

  // 3단계(기본/추천/프리미엄) 플랜은 입주·이사 같은 평당 거주지 청소에만 자연스러움.
  // 대수·개수·정액·상담 단위(에어컨·가전·줄눈·B2B)는 단일 금액이 맞아 플랜 설정을 숨긴다.
  const supportsTiers = currentUnit === '평당'
  // 규모 구간 단가는 규모를 곱하는 단위(평당·개수)에서만 의미가 있다
  const supportsVolumeTiers = currentUnit === '평당' || currentUnit === '개'

  // ── 가격 가이드 ── 직접 가격(있으면) 또는 기본가 × 배수로 플랜별 예시 가격 실시간 계산
  const currentBase = Number(watch('base_price')) || service.base_price
  const roundK = (n: number) => Math.round(n / 1000) * 1000
  const perUnit = service.unit === '평당' ? '/평' : ''
  // 자동 제안가 (직접 입력 없을 때의 기본값 — placeholder로도 보여줌)
  const autoB = roundK(currentBase * tierMultipliers.better)
  const autoP = roundK(currentBase * tierMultipliers.best)
  // 실효 가격 = 직접 입력값 우선, 없으면 자동값
  const exG = currentBase                                        // 기본 = 기본가
  const exB = tierBetterPrice ? roundK(Number(tierBetterPrice)) : autoB
  const exP = tierBestPrice   ? roundK(Number(tierBestPrice))   : autoP

  // ── 판단 기준은 금액이 아니라 "기본가 대비 몇 %" ──
  // 기본가가 1만원이든 3만원이든 같은 잣대로 보려면 인상률이어야 한다.
  // (예전엔 기본가×1.25 와 (기본+프리미엄)/2 를 비교했는데, 기본 배수가 1.5면 두 값이
  //  똑같아져 권장 구간이 0원 폭이 됐다 → 자동 제안가 +20%마저 "너무 비슷해요"로 떴다)
  const betterUpliftPct = exG > 0 && exB > 0 ? (exB / exG - 1) * 100 : 0   // 기본 → 추천 인상률
  const premiumGapPct   = exB > 0 && exP > 0 ? (exP / exB - 1) * 100 : 0   // 추천 → 프리미엄 간격
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}%`
  // 권장 가격대 = 기준 퍼센트를 지금 기본가에 적용한 금액
  // (1,000원 단위로 반올림하면 구간이 좁아져 표시된 %와 어긋나므로 100원 단위로 둔다)
  const round100 = (n: number) => Math.round(n / 100) * 100
  const recoLo = round100(exG * (1 + BETTER_UPLIFT_BAND.min / 100))
  const recoHi = round100(exG * (1 + BETTER_UPLIFT_BAND.max / 100))

  const priceNudge: { level: 'good' | 'tip' | 'warn'; msg: string } = (() => {
    if (!(exG > 0 && exB > 0 && exP > 0)) return { level: 'tip', msg: '기본가를 입력하면 추천 가격대가 표시돼요' }
    if (!(exG < exB && exB < exP)) return { level: 'warn', msg: '가격이 기본 < 추천 < 프리미엄 순서가 되도록 조정하세요' }
    if (betterUpliftPct < BETTER_UPLIFT_BAND.min) {
      return {
        level: 'tip',
        msg: `추천이 기본보다 ${pct(betterUpliftPct)}밖에 안 돼요. ${pct(BETTER_UPLIFT_BAND.min)}~${pct(BETTER_UPLIFT_BAND.max)} 정도는 올려야 "조금 더 내고 업그레이드" 느낌이 나요`,
      }
    }
    if (betterUpliftPct > BETTER_UPLIFT_BAND.max) {
      return {
        level: 'tip',
        msg: `추천이 기본보다 ${pct(betterUpliftPct)}로 너무 높아요. ${pct(BETTER_UPLIFT_BAND.max)} 안쪽이면 부담 없이 고르기 좋아요`,
      }
    }
    if (premiumGapPct < MIN_PREMIUM_GAP_PCT) {
      return {
        level: 'tip',
        msg: `추천과 프리미엄 차이가 ${pct(premiumGapPct)}뿐이라 프리미엄이 굳이 필요 없어 보여요. 프리미엄을 조금 올리거나 추천을 낮춰주세요`,
      }
    }
    return {
      level: 'good',
      msg: `좋아요! 추천이 기본보다 ${pct(betterUpliftPct)} — 객단가는 올라가면서도 부담스럽지 않은 구간이에요`,
    }
  })()
  // 객단가 상위 업체가 실제로 쓰는 인상률 — 실집계가 있을 때만 문구를 만든다.
  // (표본이 모자라면 pricingBenchmark 자체가 null 로 내려와 이 줄이 통째로 사라진다)
  const benchmarkLine = (() => {
    const b = pricingBenchmark
    if (!b || b.topBetterUpliftPct === null) return null
    const head = `객단가가 높은 사장님들(상위 ${b.topBiz}곳)은 추천 플랜을 기본보다 평균 ${pct(b.topBetterUpliftPct)} 높게 잡고 있어요`
    // 내 설정이 그보다 확실히 낮을 때만 비교를 덧붙인다 — 잘 맞춰둔 사장님을 흔들지 않기 위함
    if (exG > 0 && exB > 0 && betterUpliftPct < b.topBetterUpliftPct - 5) {
      return `${head}. 지금 설정(${pct(betterUpliftPct)})보다 높은 편이에요`
    }
    return `${head}.`
  })()

  const priceNudgeStyle = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    tip:  'border-amber-200 bg-amber-50 text-amber-900',
    warn: 'border-red-200 bg-red-50 text-red-900',
  }[priceNudge.level]
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

  // 다른 업체들이 많이 쓰는 구성(템플릿)에서 골라 불러오기 → 그 자리에서 수정 가능
  const [showTemplates, setShowTemplates] = useState(false)
  // 객단가 상위 업체들이 실제로 쓰는 구성 — 매일 집계돼 자동으로 최신 상태가 된다.
  // 표본이 모자라 항목이 비어 있으면 목록에 넣지 않는다(빈 구성 적용 방지).
  const benchmarkTemplate: QuoteTemplate | null = (() => {
    const items = pricingBenchmark?.topItems
    if (!items || !pricingBenchmark) return null
    if (items.good.length === 0 && items.better.length === 0 && items.best.length === 0) return null
    return {
      id: 'benchmark_top_revenue',
      label: `객단가 상위 ${pricingBenchmark.topBiz}곳이 쓰는 구성`,
      description: '실제 사용 중인 구성에서 많이 겹치는 항목 — 매일 자동으로 갱신돼요',
      keywords: [],
      good: items.good,
      better: items.better,
      best: items.best,
    }
  })()
  // 실집계 구성을 맨 위에 — 없으면 기존 업계 표준 템플릿만 보인다
  const templates = [
    ...(benchmarkTemplate ? [benchmarkTemplate] : []),
    ...getTemplatesForService(service.name, service.category),
  ]

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) return
    setTierGood(tpl.good)
    setTierBetter(tpl.better)
    setTierBest(tpl.best)
    setShowTemplates(false)
    toast.success('구성을 불러왔어요. 필요하면 수정한 뒤 저장하세요')
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="h-8 w-8 p-0">
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>서비스 수정</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSubmit((data) => {
              let acTypePrices: Record<string, number> | undefined
              let unitPrices: Array<{ name: string; price: number }> | undefined
              // 현장 견적(상담)은 미리 가격이 없으므로 0으로 저장
              let basePrice = data.unit === '상담' ? 0 : Number(data.base_price)

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
                ac_type_prices:    acTypePrices,
                unit_prices:       unitPrices,
                unit_variants:     unitVariants.length > 0 ? unitVariants : undefined,
                // 구간을 껐으면 빈 배열로 보내 기존에 저장된 구간을 지운다
                volume_tiers:      showVolumeTiers ? toVolumeTiers(volumeRows) : [],
                tier_good_items:   tierGood.filter(Boolean),
                tier_better_items: tierBetter.filter(Boolean),
                tier_best_items:   tierBest.filter(Boolean),
                // 플랜별 직접 가격 — 비우면 null(자동), 기본 플랜은 기본가와 동일이라 항상 null
                tier_good_price:   null,
                tier_better_price: tierBetterPrice ? Math.max(0, Number(tierBetterPrice)) : null,
                tier_best_price:   tierBestPrice   ? Math.max(0, Number(tierBestPrice))   : null,
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

            {/* 현장 견적(상담) — 가격 대신 안내만 */}
            {currentUnit === '상담' && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                현장 방문 후 견적이라 미리 가격을 넣지 않아도 돼요. 고객이 고르면 연락처를 받아
                &lsquo;상담 요청&rsquo;으로 접수돼요.
              </p>
            )}

            {/* 기본가 — 에어컨/항목별 단가/현장견적 모드에서는 숨김 */}
            {!isAcByName && !isUnitByName && currentUnit !== '상담' && (
              <div className="space-y-1">
                <Label>기본 가격 (원) *</Label>
                <Input type="number" {...register('base_price')} />
                {errors.base_price && <p className="text-xs text-destructive">{errors.base_price.message}</p>}
              </div>
            )}

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

            {/* 규모 구간별 단가 — 평당·개수처럼 규모를 곱하는 단위에서만 의미가 있다 */}
            {!isAcByName && !isUnitByName && supportsVolumeTiers && (
              <VolumeTierEditor
                unit={currentUnit}
                basePrice={currentBase}
                enabled={showVolumeTiers}
                onEnabledChange={setShowVolumeTiers}
                rows={volumeRows}
                onRowsChange={setVolumeRows}
              />
            )}

            {/* 가전(에어컨·냉장고 등) 유형별 단가 */}
            {isAcByName && applianceTypes && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                  <Label className="text-primary">유형별 단가 설정</Label>
                </div>
                {applianceTypes.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div className="w-32 shrink-0">
                      <p className="text-xs font-semibold">{t.label}</p>
                      {t.sub && <p className="text-[11px] text-muted-foreground">{t.sub}</p>}
                    </div>
                    <div className="flex-1 relative">
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={t.defaultPrice.toLocaleString('ko-KR')}
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

            {/* 플랜 구성 항목 — 평당(거주지) 청소만 3단계 사용, 그 외엔 단일 금액 안내 */}
            <div className="space-y-4 border-t pt-4">
              {supportsTiers ? (
              <>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">플랜 구성 항목 설정</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={() => setShowTemplates((v) => !v)}
                  >
                    <Users className="h-3.5 w-3.5" />
                    많이 쓰는 구성 불러오기
                  </Button>
                </div>
                {/* ★"비워두면 자동으로 채웁니다"는 '안 채우면 알아서 팔린다'로 읽혔다.
                    실제로는 추천·프리미엄이 비어 있으면 3단계를 아예 안 보낸다 — 그 사실을 그대로 적는다. */}
                <p className="text-xs text-muted-foreground mt-0.5">
                  <b className="text-foreground">추천·프리미엄에 항목을 넣어야 3단계 견적으로 나갑니다.</b>{' '}
                  기본만 채우시면 고객에게는 <b className="text-foreground">금액 하나</b>와 포함 항목만 보여요.
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  ✏️ 짧은 명사형으로 입력해주세요 — &ldquo;필터 세척&rdquo; O, &ldquo;필터를 세척해드립니다&rdquo; X
                </p>

                {/* 많이 쓰는 구성 템플릿 고르기 — 불러온 뒤 자유롭게 수정 가능 */}
                {showTemplates && (
                  <div className="mt-3 space-y-2 rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      다른 청소업체들이 많이 쓰는 구성이에요. 골라서 불러온 뒤 자유롭게 고치세요.
                    </p>
                    {templates.map((tpl) => (
                      <div key={tpl.id} className="rounded-lg border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{tpl.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 shrink-0 gap-1 text-xs"
                            onClick={() => applyTemplate(tpl.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                            이 구성 적용
                          </Button>
                        </div>
                        {/* 미리보기 — 각 플랜 대표 항목 */}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          {([
                            { label: '기본', items: tpl.good },
                            { label: '추천', items: tpl.better },
                            { label: '프리미엄', items: tpl.best },
                          ] as const).map((col) => (
                            <div key={col.label} className="min-w-0">
                              <p className="font-semibold text-foreground mb-0.5">{col.label}</p>
                              <ul className="space-y-0.5 text-muted-foreground">
                                {col.items.slice(0, 3).map((it, i) => (
                                  <li key={i} className="truncate">· {it}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <TierItemsEditor
                  tone="good"
                  title="기본 플랜"
                  badge="가장 저렴"
                  hint="이 서비스의 핵심 작업"
                  placeholder="예: 필터 세척"
                  items={tierGood}
                  onChange={setTierGood}
                  pullServices={otherServices}
                  examplePrice={exG}
                  autoPrice={exG}
                  unitSuffix={perUnit}
                />
                <div className="flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">＋ 위 기본 플랜 전부 포함</span>
                </div>
                <TierItemsEditor
                  tone="better"
                  title="추천 플랜"
                  badge="가장 많이 선택"
                  hint="기본에 더해서 제공할 작업만 적어요"
                  placeholder="예: 열교환기 세척"
                  items={tierBetter}
                  onChange={setTierBetter}
                  pullServices={otherServices}
                  examplePrice={exB}
                  priceValue={tierBetterPrice}
                  onPriceChange={setTierBetterPrice}
                  autoPrice={autoB}
                  unitSuffix={perUnit}
                />
                <div className="flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">＋ 위 추천 플랜 전부 포함</span>
                </div>
                <TierItemsEditor
                  tone="best"
                  title="프리미엄 플랜"
                  badge="최고급"
                  hint="추천에 더해서 제공할 작업만 적어요"
                  placeholder="예: 항균 코팅"
                  items={tierBest}
                  onChange={setTierBest}
                  pullServices={otherServices}
                  examplePrice={exP}
                  priceValue={tierBestPrice}
                  onPriceChange={setTierBestPrice}
                  autoPrice={autoP}
                  unitSuffix={perUnit}
                />
              </div>

              {/* 가격 가이드 — 추천 가격대 + 한도 알림 */}
              <div className="rounded-xl border bg-card p-3.5 space-y-2">
                <p className="text-sm font-semibold">💡 가격 가이드 — 중간(추천) 플랜이 많이 선택되게</p>
                <p className="text-[11px] text-muted-foreground">
                  기본가 {currentBase.toLocaleString()}원{perUnit} 기준 예시. 실제 견적은 옵션·평수에 따라 달라져요.
                </p>
                {exG > 0 && recoHi > recoLo && (
                  <p className="text-xs text-muted-foreground">
                    추천 플랜 권장 구간:{' '}
                    <span className="font-semibold text-foreground tabular-nums">
                      기본보다 +{BETTER_UPLIFT_BAND.min}~{BETTER_UPLIFT_BAND.max}%
                    </span>
                    {' '}({recoLo.toLocaleString()}~{recoHi.toLocaleString()}원{perUnit})
                  </p>
                )}
                {exG > 0 && exB > 0 && (
                  <p className="text-xs text-muted-foreground">
                    지금 설정:{' '}
                    <span className="font-semibold text-foreground tabular-nums">추천 {pct(betterUpliftPct)}</span>
                    {exP > 0 && (
                      <> · <span className="font-semibold text-foreground tabular-nums">프리미엄 {pct((exP / exG - 1) * 100)}</span></>
                    )}
                    {' '}(기본가 대비)
                  </p>
                )}
                <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${priceNudgeStyle}`}>
                  {priceNudge.level === 'good' ? '✓ ' : priceNudge.level === 'warn' ? '⚠️ ' : '💡 '}
                  {priceNudge.msg}
                </div>
                {/* 객단가 상위 업체 실집계 — 표본이 모였을 때만 노출(지어낸 수치 금지) */}
                {benchmarkLine && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs leading-relaxed text-emerald-900">
                    📈 {benchmarkLine}
                  </div>
                )}
              </div>
              </>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-1">
                  <p className="text-sm font-medium">이 서비스는 단일 금액으로 안내돼요</p>
                  <p className="text-xs text-muted-foreground leading-relaxed break-keep">
                    기본·추천·프리미엄 3단계 플랜은 입주·이사 같은 평당 거주지 청소에서 사용해요.
                    단위를 &lsquo;평당&rsquo;으로 바꾸면 3단계 구성을 설정할 수 있어요.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? '저장 중...' : '저장하기'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
