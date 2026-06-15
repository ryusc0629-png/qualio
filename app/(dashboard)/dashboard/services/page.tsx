import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddServiceForm } from '@/components/dashboard/add-service-form'
import { DeleteServiceButton } from '@/components/dashboard/delete-service-button'
import { EditServiceButton } from '@/components/dashboard/edit-service-button'
import { Image, Zap } from 'lucide-react'
import { isAcService } from '@/lib/utils'

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
    .select('id, name, category, base_price, unit, is_active, photos, ac_type_prices, unit_prices, unit_variants, tier_good_items, tier_better_items, tier_best_items')
    .eq('business_id', profile.business_id)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at')

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

      {!services || services.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">아직 등록된 서비스가 없어요</p>
          <p className="text-xs text-muted-foreground">오른쪽 위 버튼을 눌러 첫 번째 서비스를 추가해보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((service) => {
            const photoCount = service.photos?.length ?? 0

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
                      {isAcService(service.name) && (
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
                    {/* 에어컨 유형별 단가 표시 */}
                    {isAcService(service.name) && service.ac_type_prices && typeof service.ac_type_prices === 'object' && !Array.isArray(service.ac_type_prices) ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {(Object.entries(service.ac_type_prices as Record<string, number>)).map(([id, price]) => {
                          const labelMap: Record<string, string> = {
                            wall_standard: '벽걸이 일반', wall_baramless: '벽걸이 무풍',
                            stand_standard: '스탠드 일반', stand_smart: '스탠드 스마트',
                            system_1way: '시스템 1way', system_4way: '시스템 4way',
                            commercial: '업소형',
                          }
                          return (
                            <span key={id} className="text-xs text-muted-foreground tabular-nums">
                              {labelMap[id] ?? id}: <span className="font-semibold text-foreground">{price.toLocaleString('ko-KR')}원</span>
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
                    {photoCount > 0 && (
                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                        <Image className="h-3 w-3" />
                        사진 {photoCount}장
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
                      tier_good_items:   service.tier_good_items   ?? [],
                      tier_better_items: service.tier_better_items ?? [],
                      tier_best_items:   service.tier_best_items   ?? [],
                    }} />
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
