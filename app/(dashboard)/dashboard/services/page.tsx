import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddServiceForm } from '@/components/dashboard/add-service-form'
import { DeleteServiceButton } from '@/components/dashboard/delete-service-button'
import { DuplicateServiceButton } from '@/components/dashboard/duplicate-service-button'
import { EditServiceButton } from '@/components/dashboard/edit-service-button'
import { ServicesGuideCard } from '@/components/dashboard/services-guide-card'
import { Zap } from 'lucide-react'
import { isApplianceService, getApplianceTypes } from '@/lib/utils'
import { getLatestPricingBenchmark } from '@/lib/benchmarks/pricing-benchmark'

export default async function ServicesPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()

  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')

  const { data: services } = await db
    .from('service_items')
    .select('id, name, category, base_price, unit, is_active, ac_type_prices, unit_prices, unit_variants, tier_good_items, tier_better_items, tier_best_items')
    .eq('business_id', profile.business_id)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at')

  // 온보딩 안내용 — 서비스 등록 여부 / 플랜 구성 여부
  const serviceCount = services?.length ?? 0
  const hasBundles = (services ?? []).some((s) => (s.tier_good_items?.length ?? 0) > 0)

  // 플랜 배수 (예시 가격 계산용) — quote_tiers에서
  const tierMultipliers = { good: 1.0, better: 1.2, best: 1.5 }
  {
    const { data: tierRows } = await db
      .from('quote_tiers')
      .select('tier, price_multiplier')
      .eq('business_id', profile.business_id)
    for (const t of tierRows ?? []) {
      if (t.tier === 'good' || t.tier === 'better' || t.tier === 'best') {
        tierMultipliers[t.tier] = Number(t.price_multiplier) || tierMultipliers[t.tier]
      }
    }
  }

  // 객단가 상위 업체 가격 벤치마크 (매일 cron 갱신) — 표본 미달이면 null 이라 문구가 숨겨진다
  const pricingBenchmark = await getLatestPricingBenchmark()

  // 서비스별 플랜 할인 (컬럼 없으면 빈 맵 — 마이그레이션 전 안전)
  type DiscRow = {
    id: string
    tier_good_discount_rate: number | null; tier_good_discount_amount: number | null
    tier_better_discount_rate: number | null; tier_better_discount_amount: number | null
    tier_best_discount_rate: number | null; tier_best_discount_amount: number | null
  }
  const discMap: Record<string, DiscRow> = {}
  {
    const { data, error } = await db
      .from('service_items')
      .select('id, tier_good_discount_rate, tier_good_discount_amount, tier_better_discount_rate, tier_better_discount_amount, tier_best_discount_rate, tier_best_discount_amount' as never)
      .eq('business_id', profile.business_id)
      .is('deleted_at', null)
    if (!error && data) for (const r of data as unknown as DiscRow[]) discMap[r.id] = r
  }

  // 규모 구간별 단가 — database.ts 타입이 아직 갱신되지 않아 할인과 같은 방식으로 따로 조회
  type VolumeRow = { id: string; volume_tiers: Array<{ min_size: number; price: number }> | null }
  const volumeMap: Record<string, VolumeRow['volume_tiers']> = {}
  {
    const { data, error } = await db
      .from('service_items')
      .select('id, volume_tiers' as never)
      .eq('business_id', profile.business_id)
      .is('deleted_at', null)
    if (!error && data) {
      for (const r of data as unknown as VolumeRow[]) {
        volumeMap[r.id] = Array.isArray(r.volume_tiers) ? r.volume_tiers : null
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">서비스 항목</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            등록된 서비스는 고객 견적 폼에 자동으로 노출돼요
          </p>
        </div>
        <AddServiceForm />
      </div>

      {/* 단계별 안내 카드 (비테크 사장님용) */}
      <ServicesGuideCard serviceCount={serviceCount} hasBundles={hasBundles} />

      {!services || services.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">아직 등록된 서비스가 없어요</p>
          <p className="text-xs text-muted-foreground">오른쪽 위 버튼을 눌러 첫 번째 서비스를 추가해보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((service) => {
            return (
              <div
                key={service.id}
                className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{service.name}</p>
                      {service.category && (
                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          {service.category}
                        </span>
                      )}
                      {isApplianceService(service.name) && (
                        <span className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                          <Zap className="h-2.5 w-2.5" />
                          유형·대수 자동 선택
                        </span>
                      )}
                      {!service.is_active && (
                        <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                          비활성
                        </span>
                      )}
                    </div>
                    {/* 가전(에어컨·냉장고 등) 유형별 단가 표시 */}
                    {isApplianceService(service.name) && service.ac_type_prices && typeof service.ac_type_prices === 'object' && !Array.isArray(service.ac_type_prices) ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {(Object.entries(service.ac_type_prices as Record<string, number>)).map(([id, price]) => {
                          const t = (getApplianceTypes(service.name) ?? []).find((x) => x.id === id)
                          const label = t ? `${t.label}${t.sub ? ` ${t.sub}` : ''}` : id
                          return (
                            <span key={id} className="text-xs text-muted-foreground tabular-nums">
                              {label}: <span className="font-semibold text-foreground">{price.toLocaleString('ko-KR')}원</span>
                            </span>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm mt-1.5">
                        <span className="font-bold tabular-nums">{service.base_price.toLocaleString('ko-KR')}원</span>
                        <span className="text-xs text-muted-foreground ml-1">/ {service.unit}</span>
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-1">
                    <EditServiceButton service={{
                      ...service,
                      ac_type_prices: (service.ac_type_prices && typeof service.ac_type_prices === 'object' && !Array.isArray(service.ac_type_prices))
                        ? service.ac_type_prices as Record<string, number>
                        : null,
                      unit_prices: Array.isArray(service.unit_prices)
                        ? service.unit_prices as Array<{ name: string; price: number; variant?: string }>
                        : null,
                      unit_variants: Array.isArray(service.unit_variants)
                        ? service.unit_variants as string[]
                        : null,
                      volume_tiers: volumeMap[service.id] ?? null,
                      tier_good_items:   service.tier_good_items   ?? [],
                      tier_better_items: service.tier_better_items ?? [],
                      tier_best_items:   service.tier_best_items   ?? [],
                      tier_good_discount_rate:     discMap[service.id]?.tier_good_discount_rate     ?? 0,
                      tier_good_discount_amount:   discMap[service.id]?.tier_good_discount_amount   ?? 0,
                      tier_better_discount_rate:   discMap[service.id]?.tier_better_discount_rate   ?? 0,
                      tier_better_discount_amount: discMap[service.id]?.tier_better_discount_amount ?? 0,
                      tier_best_discount_rate:     discMap[service.id]?.tier_best_discount_rate     ?? 0,
                      tier_best_discount_amount:   discMap[service.id]?.tier_best_discount_amount   ?? 0,
                    }}
                    availableServices={(services ?? []).map((s) => ({ id: s.id, name: s.name }))}
                    tierMultipliers={tierMultipliers}
                    pricingBenchmark={pricingBenchmark}
                    />
                    <DuplicateServiceButton id={service.id} />
                    <DeleteServiceButton id={service.id} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
