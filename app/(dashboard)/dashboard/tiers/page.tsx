import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TierBundleEditor } from './tier-bundle-editor'

// 티어 설정 페이지 (서버 컴포넌트)
export default async function TiersPage() {
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

  const businessId = profile.business_id

  // 서비스 목록 조회
  const { data: services } = await db
    .from('service_items')
    .select('id, name, base_price, unit, category')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at')

  // 티어 목록 + 현재 연결된 서비스 조회
  const tiersQuery = () => db
    .from('quote_tiers')
    .select('id, tier, label, description, highlight, sort_order')
    .eq('business_id', businessId)
    .order('sort_order')

  let { data: tiers } = await tiersQuery()

  // 티어가 하나도 없으면 기본 3단계 자동 생성 (온보딩 누락된 옛 계정 보정 — idempotent)
  if (!tiers || tiers.length === 0) {
    await db.from('quote_tiers').insert([
      { business_id: businessId, tier: 'good',   label: '기본',     price_multiplier: 1.0, highlight: false, sort_order: 0 },
      { business_id: businessId, tier: 'better', label: '추천',     price_multiplier: 1.2, highlight: true,  sort_order: 1 },
      { business_id: businessId, tier: 'best',   label: '프리미엄', price_multiplier: 1.5, highlight: false, sort_order: 2 },
    ])
    tiers = (await tiersQuery()).data
  }

  // 각 티어에 연결된 서비스 ID 조회
  const tierIds = tiers?.map((t) => t.id) ?? []
  const { data: tierServices } = tierIds.length > 0
    ? await db
        .from('quote_tier_services')
        .select('tier_id, service_id')
        .in('tier_id', tierIds)
    : { data: [] }

  // 티어별 현재 서비스 ID 맵
  const currentBundles: Record<string, string[]> = {}
  for (const ts of tierServices ?? []) {
    if (!currentBundles[ts.tier_id]) currentBundles[ts.tier_id] = []
    currentBundles[ts.tier_id].push(ts.service_id)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">견적 플랜 설정</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          기본 / 추천 / 프리미엄 각 플랜에 포함할 서비스를 선택하세요. AI가 최적 조합을 추천해드립니다.
        </p>
      </div>

      {!services || services.length < 2 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">서비스를 2개 이상 등록해야 플랜을 구성할 수 있습니다</p>
          <a href="/dashboard/services" className="text-primary text-sm hover:underline mt-2 inline-block">
            서비스 추가하러 가기 →
          </a>
        </div>
      ) : (
        <TierBundleEditor
          services={services ?? []}
          tiers={tiers ?? []}
          currentBundles={currentBundles}
        />
      )}
    </div>
  )
}
