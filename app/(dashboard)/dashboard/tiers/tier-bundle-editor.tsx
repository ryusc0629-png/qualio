'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { saveTierBundleAction, aiSuggestBundleAction } from '@/lib/actions/tiers'
import { Sparkles, Save } from 'lucide-react'

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
  highlight: boolean
  sort_order: number
}

interface Props {
  services: Service[]
  tiers: Tier[]
  currentBundles: Record<string, string[]>  // tier_id → service_id[]
}

const TIER_ORDER = ['good', 'better', 'best']
const TIER_COLOR: Record<string, string> = {
  good:   'border-gray-300 bg-gray-50',
  better: 'border-blue-300 bg-blue-50',
  best:   'border-purple-300 bg-purple-50',
}

export function TierBundleEditor({ services, tiers, currentBundles }: Props) {
  // 티어별 선택된 서비스 ID 세트 (tier_id → Set<service_id>)
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {}
    for (const tier of tiers) {
      init[tier.id] = new Set(currentBundles[tier.id] ?? [])
    }
    return init
  })

  const [aiReason, setAiReason] = useState<string | null>(null)

  // 저장 액션
  const { execute: save, isPending: isSaving } = useAction(saveTierBundleAction, {
    onSuccess: () => toast.success('플랜 설정이 저장되었습니다'),
    onError: ({ error }) => toast.error(error.serverError ?? '저장에 실패했습니다'),
  })

  // AI 추천 액션
  const { execute: suggest, isPending: isSuggesting } = useAction(aiSuggestBundleAction, {
    onSuccess: ({ data }) => {
      if (!data) return

      // AI 추천 결과를 selected에 반영
      const tierByKey: Record<string, Tier> = {}
      for (const tier of tiers) tierByKey[tier.tier] = tier

      const next: Record<string, Set<string>> = {}
      for (const tier of tiers) {
        next[tier.id] = new Set(selected[tier.id]) // 기존 유지
      }

      const keyMap: Record<string, keyof typeof data> = {
        good: 'good', better: 'better', best: 'best'
      }

      for (const [tierKey, dataKey] of Object.entries(keyMap)) {
        const tier = tierByKey[tierKey]
        if (!tier) continue
        const ids = data[dataKey as 'good' | 'better' | 'best']
        next[tier.id] = new Set(ids)
      }

      setSelected(next)
      setAiReason(data.reason ?? null)
      toast.success('AI 추천이 적용되었습니다. 검토 후 저장해주세요.')
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'AI 추천에 실패했습니다'),
  })

  const toggleService = (tierId: string, serviceId: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      const set = new Set(next[tierId])
      if (set.has(serviceId)) {
        set.delete(serviceId)
      } else {
        set.add(serviceId)
      }
      next[tierId] = set
      return next
    })
  }

  const handleSave = () => {
    const bundles = tiers.map((tier) => ({
      tier_id: tier.id,
      service_ids: Array.from(selected[tier.id] ?? []),
    }))
    save({ bundles })
  }

  // 각 tier의 합산 가격 계산 (평수 없으므로 정액 서비스 합산만)
  const calcPrice = (tierId: string) => {
    const ids = selected[tierId] ?? new Set()
    return Array.from(ids).reduce((sum, sid) => {
      const svc = services.find((s) => s.id === sid)
      if (!svc) return sum
      if (svc.unit === '평당') return sum // 평수 없을 때 표시 생략
      return sum + svc.base_price
    }, 0)
  }

  // 정렬된 티어 (good → better → best 순)
  const sortedTiers = [...tiers].sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
  )

  return (
    <div className="space-y-5">
      {/* AI 추천 버튼 */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => suggest({})}
          disabled={isSuggesting}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {isSuggesting ? 'AI 분석 중...' : 'AI 번들 자동 추천'}
        </Button>
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          <Save className="h-4 w-4" />
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      </div>

      {/* AI 추천 이유 */}
      {aiReason && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="font-medium">AI 추천 이유:</span> {aiReason}
        </div>
      )}

      {/* 3열 번들 편집기 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedTiers.map((tier) => {
          const price = calcPrice(tier.id)
          const hasPerUnit = Array.from(selected[tier.id] ?? []).some(
            (sid) => services.find((s) => s.id === sid)?.unit === '평당'
          )

          return (
            <div
              key={tier.id}
              className={`rounded-lg border-2 p-4 space-y-3 ${TIER_COLOR[tier.tier] ?? 'border-border bg-background'}`}
            >
              {/* 티어 헤더 */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm">{tier.label}</span>
                  {tier.highlight && (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                      추천
                    </span>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {price > 0 && (
                    <span className="font-medium text-foreground">
                      {price.toLocaleString()}원~
                    </span>
                  )}
                  {hasPerUnit && <div>+평당 서비스 별도</div>}
                </div>
              </div>

              {/* 서비스 체크박스 목록 */}
              <div className="space-y-2">
                {services.map((svc) => {
                  const checked = selected[tier.id]?.has(svc.id) ?? false
                  return (
                    <label
                      key={svc.id}
                      className="flex items-start gap-2 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleService(tier.id, svc.id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm leading-tight ${checked ? 'font-medium' : 'text-muted-foreground'}`}>
                          {svc.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {svc.base_price.toLocaleString()}원/{svc.unit}
                        </div>
                      </div>
                    </label>
                  )
                })}
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
        * 평당 서비스는 고객이 평수를 입력하면 자동으로 합산됩니다
      </p>
    </div>
  )
}
