'use client'

import { useMemo, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveTierBundleAction, aiSuggestBundleAction } from '@/lib/actions/tiers'
import { Sparkles, Save, Star, Wrench, TrendingUp } from 'lucide-react'

interface Service {
  id: string
  name: string
  base_price: number
  unit: string
  category: string | null
}

interface Tier {
  id: string
  tier: string
  label: string
  description: string | null
  highlight: boolean
  sort_order: number
  price_multiplier: number  // 기본가 대비 배수 (good 1.0 / better 1.2 / best 1.5)
  discount_rate: number     // 할인율 %
  discount_amount: number   // 할인액 원
}

interface Props {
  services: Service[]
  tiers: Tier[]
  referenceBase: number     // 가격 심리 가이드 예시용 기준가
  currentBundles: Record<string, string[]>  // tier_id → service_id[]
}

const TIER_ORDER = ['good', 'better', 'best']
const TIER_COLOR: Record<string, string> = {
  good:   'border-gray-300 bg-gray-50',
  better: 'border-emerald-300 bg-emerald-50',
  best:   'border-purple-300 bg-purple-50',
}

export function TierBundleEditor({ services, tiers, referenceBase, currentBundles }: Props) {
  // 티어별 선택된 서비스 ID 세트 (tier_id → Set<service_id>)
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {}
    for (const tier of tiers) init[tier.id] = new Set(currentBundles[tier.id] ?? [])
    return init
  })

  // 플랜 메타 — 이름·설명·추천(강조) 1개. 사장님이 직접 수정 가능.
  const [labels, setLabels] = useState<Record<string, string>>(
    () => Object.fromEntries(tiers.map((t) => [t.id, t.label]))
  )
  const [descriptions, setDescriptions] = useState<Record<string, string>>(
    () => Object.fromEntries(tiers.map((t) => [t.id, t.description ?? '']))
  )
  const [highlightTierId, setHighlightTierId] = useState<string | null>(
    () => tiers.find((t) => t.highlight)?.id ?? null
  )
  // 플랜별 할인 — 자동 계산 가격에서 차감 (업체 전체 공통)
  const [discountRates, setDiscountRates] = useState<Record<string, string>>(
    () => Object.fromEntries(tiers.map((t) => [t.id, t.discount_rate ? String(t.discount_rate) : '']))
  )
  const [discountAmounts, setDiscountAmounts] = useState<Record<string, string>>(
    () => Object.fromEntries(tiers.map((t) => [t.id, t.discount_amount ? String(t.discount_amount) : '']))
  )
  const [aiReason, setAiReason] = useState<string | null>(null)

  // 사이드바 '서비스' 항목을 카테고리별로 묶어 보기 좋게 연결
  const servicesByCategory = useMemo(() => {
    const m = new Map<string, Service[]>()
    for (const s of services) {
      const c = s.category?.trim() || '기타'
      m.set(c, [...(m.get(c) ?? []), s])
    }
    return [...m.entries()]
  }, [services])

  // 저장 액션
  const { execute: save, isPending: isSaving } = useAction(saveTierBundleAction, {
    onSuccess: () => toast.success('플랜이 저장됐어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '저장 못 했어요. 다시 눌러주세요'),
  })

  // AI 추천 액션
  const { execute: suggest, isPending: isSuggesting } = useAction(aiSuggestBundleAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      const tierByKey: Record<string, Tier> = {}
      for (const tier of tiers) tierByKey[tier.tier] = tier

      const next: Record<string, Set<string>> = {}
      for (const tier of tiers) next[tier.id] = new Set(selected[tier.id]) // 기존 유지

      for (const key of ['good', 'better', 'best'] as const) {
        const tier = tierByKey[key]
        if (!tier) continue
        next[tier.id] = new Set(data[key])
      }

      setSelected(next)
      setAiReason(data.reason ?? null)
      toast.success('AI 추천을 적용했어요. 검토 후 저장하세요')
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'AI 추천에 실패했어요'),
  })

  const toggleService = (tierId: string, serviceId: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      const set = new Set(next[tierId])
      if (set.has(serviceId)) set.delete(serviceId)
      else set.add(serviceId)
      next[tierId] = set
      return next
    })
  }

  const handleSave = () => {
    const bundles = tiers.map((tier) => ({
      tier_id: tier.id,
      label: (labels[tier.id] ?? tier.label).trim(),
      description: (descriptions[tier.id] ?? '').trim(),
      service_ids: Array.from(selected[tier.id] ?? []),
      discount_rate: Math.min(100, Math.max(0, Number(discountRates[tier.id]) || 0)),
      discount_amount: Math.max(0, Number(discountAmounts[tier.id]) || 0),
    }))
    if (bundles.some((b) => !b.label)) {
      toast.error('플랜 이름을 모두 입력해주세요')
      return
    }
    save({ highlightTierId, bundles })
  }

  // 각 tier의 합산 가격 (정액 서비스만 — 평당은 평수 입력 시 합산되므로 별도 표시)
  const calcPrice = (tierId: string) =>
    Array.from(selected[tierId] ?? []).reduce((sum, sid) => {
      const svc = services.find((s) => s.id === sid)
      if (!svc || svc.unit === '평당') return sum
      return sum + svc.base_price
    }, 0)

  const sortedTiers = [...tiers].sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
  )

  // ── 가격 심리 가이드 ── 기준가 × 배수 × 할인으로 예시 가격을 실시간 계산
  const roundK = (n: number) => Math.round(n / 1000) * 1000
  const examplePrice = (tier: Tier) => {
    const rate = Math.min(100, Math.max(0, Number(discountRates[tier.id]) || 0))
    const amt = Math.max(0, Number(discountAmounts[tier.id]) || 0)
    const base = referenceBase * Number(tier.price_multiplier || 1)
    return Math.max(0, roundK(base * (1 - rate / 100) - amt))
  }
  const tierByKey = Object.fromEntries(tiers.map((t) => [t.tier, t])) as Record<string, Tier>
  const exG = tierByKey.good   ? examplePrice(tierByKey.good)   : 0
  const exB = tierByKey.better ? examplePrice(tierByKey.better) : 0
  const exP = tierByKey.best   ? examplePrice(tierByKey.best)   : 0
  // 추천 플랜 권장 가격대: 기본의 1.25배 ~ (기본+프리미엄)/2 (중간값보다 낮게 두면 '합리적'으로 보임)
  const recoLo = roundK(exG * 1.25)
  const recoHi = roundK((exG + exP) / 2)
  // 한도 알림 — 중간(추천) 선택을 유도하는 가격 구조인지 점검
  const nudge: { level: 'good' | 'tip' | 'warn'; msg: string } = (() => {
    if (!(exG > 0 && exB > 0 && exP > 0)) return { level: 'tip', msg: '서비스를 등록하면 예시 가격이 더 정확해져요' }
    if (!(exG < exB && exB < exP)) return { level: 'warn', msg: '가격이 기본 < 추천 < 프리미엄 순서가 되도록 맞춰주세요' }
    if (exB < recoLo) return { level: 'tip', msg: '추천이 기본과 너무 비슷해요. 추천에 항목을 더하거나 기본 할인을 줄여 차이를 키우면 업그레이드처럼 보여요' }
    if (exB > recoHi) return { level: 'tip', msg: '추천이 프리미엄에 너무 가까워요. 추천에 할인을 더 주면 가장 합리적인 선택으로 보여요' }
    return { level: 'good', msg: '좋아요! 추천 플랜이 중간에서 가장 합리적으로 보여 가장 많이 선택될 구조예요' }
  })()
  const nudgeStyle = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    tip:  'border-amber-200 bg-amber-50 text-amber-900',
    warn: 'border-red-200 bg-red-50 text-red-900',
  }[nudge.level]

  return (
    <div className="space-y-5">
      {/* 액션 버튼 */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={() => suggest({})}
          disabled={isSuggesting || isSaving}
          className="gap-2 h-12"
        >
          <Sparkles className="h-4 w-4" />
          {isSuggesting ? 'AI 분석 중...' : 'AI 번들 자동 추천'}
        </Button>
        <Button onClick={handleSave} disabled={isSaving || isSuggesting} className="gap-2 h-12">
          <Save className="h-4 w-4" />
          {isSaving ? '저장 중...' : '저장하기'}
        </Button>
        <Link
          href="/dashboard/services"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          <Wrench className="h-3.5 w-3.5" />
          서비스 항목 관리
        </Link>
      </div>

      {/* 가격 심리 가이드 — 중간(추천) 플랜이 가장 많이 선택되게 */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="font-semibold text-sm">가격 가이드 — 중간(추천) 플랜이 많이 선택되게</p>
        </div>
        <p className="text-xs text-muted-foreground">
          기준가 <span className="font-medium text-foreground">{referenceBase.toLocaleString()}원</span> 예시 (할인 반영). 실제 견적은 서비스 구성에 따라 달라져요.
        </p>
        {/* 예시 가격 3단 — 추천 강조 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '기본', price: exG, hl: false },
            { label: '추천', price: exB, hl: true },
            { label: '프리미엄', price: exP, hl: false },
          ].map((c) => (
            <div
              key={c.label}
              className={`rounded-lg border p-2.5 text-center ${c.hl ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-muted/40'}`}
            >
              <p className="text-[11px] text-muted-foreground">{c.label}{c.hl && ' ⭐'}</p>
              <p className={`text-sm font-bold tabular-nums ${c.hl ? 'text-emerald-700' : 'text-foreground'}`}>
                {c.price.toLocaleString()}원
              </p>
            </div>
          ))}
        </div>
        {/* 추천 가격대 */}
        {exG > 0 && exP > 0 && recoHi > recoLo && (
          <p className="text-xs text-muted-foreground">
            추천 플랜 권장 가격대:{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {recoLo.toLocaleString()}~{recoHi.toLocaleString()}원
            </span>{' '}
            (이 사이에 두면 가장 합리적으로 보여요)
          </p>
        )}
        {/* 한도 알림 */}
        <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${nudgeStyle}`}>
          {nudge.level === 'good' ? '✓ ' : nudge.level === 'warn' ? '⚠️ ' : '💡 '}
          {nudge.msg}
        </div>
      </div>

      {aiReason && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="font-medium">AI 추천 이유</span> — {aiReason}
        </div>
      )}

      {/* 3열 번들 편집기 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedTiers.map((tier) => {
          const price = calcPrice(tier.id)
          const hasPerUnit = Array.from(selected[tier.id] ?? []).some(
            (sid) => services.find((s) => s.id === sid)?.unit === '평당'
          )
          const isHighlight = highlightTierId === tier.id

          return (
            <div
              key={tier.id}
              className={`rounded-lg border-2 p-4 space-y-3 ${TIER_COLOR[tier.tier] ?? 'border-border bg-background'}`}
            >
              {/* 추천 토글 */}
              <button
                type="button"
                onClick={() => setHighlightTierId(isHighlight ? null : tier.id)}
                className={`w-full flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  isHighlight
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white/70 text-muted-foreground hover:bg-white'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${isHighlight ? 'fill-current' : ''}`} />
                {isHighlight ? '추천 플랜 (고객에게 강조됨)' : '추천 플랜으로 표시'}
              </button>

              {/* 플랜 이름 (직접 수정) */}
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">플랜 이름</label>
                <Input
                  value={labels[tier.id] ?? ''}
                  onChange={(e) => setLabels((p) => ({ ...p, [tier.id]: e.target.value }))}
                  placeholder="예: 기본"
                  className="h-9 bg-white"
                  maxLength={20}
                />
              </div>

              {/* 한줄 설명 (직접 수정) */}
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">한줄 설명 (선택)</label>
                <Input
                  value={descriptions[tier.id] ?? ''}
                  onChange={(e) => setDescriptions((p) => ({ ...p, [tier.id]: e.target.value }))}
                  placeholder="예: 꼭 필요한 것만 합리적으로"
                  className="h-9 bg-white"
                  maxLength={100}
                />
              </div>

              {/* 할인 설정 — 자동 계산된 견적가에서 차감 (업체 전체 공통) */}
              <div className="space-y-1 rounded-lg bg-white/70 p-2.5">
                <label className="text-[11px] text-muted-foreground">할인 (선택) — 견적가에서 자동 차감</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-1">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={discountRates[tier.id] ?? ''}
                      onChange={(e) => setDiscountRates((p) => ({ ...p, [tier.id]: e.target.value }))}
                      placeholder="0"
                      className="h-9 bg-white text-right"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">%</span>
                  </div>
                  <div className="flex-1 flex items-center gap-1">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={discountAmounts[tier.id] ?? ''}
                      onChange={(e) => setDiscountAmounts((p) => ({ ...p, [tier.id]: e.target.value }))}
                      placeholder="0"
                      className="h-9 bg-white text-right"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">원</span>
                  </div>
                </div>
              </div>

              {/* 가격 요약 */}
              <div className="text-right text-xs text-muted-foreground min-h-[1rem]">
                {price > 0 && (
                  <span className="font-semibold text-foreground text-sm">
                    {price.toLocaleString()}원~
                  </span>
                )}
                {hasPerUnit && <span className="ml-1">(+평당 별도)</span>}
              </div>

              {/* 서비스 체크박스 — 카테고리별 그룹 */}
              <div className="space-y-3 border-t pt-3">
                {servicesByCategory.map(([category, items]) => (
                  <div key={category} className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">{category}</p>
                    {items.map((svc) => {
                      const checked = selected[tier.id]?.has(svc.id) ?? false
                      return (
                        <label key={svc.id} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleService(tier.id, svc.id)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary"
                          />
                          <span className="flex-1 min-w-0">
                            <span className={`block text-sm leading-tight ${checked ? 'font-medium' : 'text-muted-foreground'}`}>
                              {svc.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {svc.base_price.toLocaleString()}원/{svc.unit}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* 선택 개수 */}
              <div className="border-t pt-2 text-xs text-muted-foreground">
                {selected[tier.id]?.size ?? 0}개 서비스 선택됨
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        * 평당 서비스는 고객이 평수를 입력하면 자동으로 합산됩니다. 수정 후 꼭 <span className="font-medium">저장하기</span>를 눌러주세요.
      </p>
    </div>
  )
}
