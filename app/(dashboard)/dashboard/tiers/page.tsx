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
    .select('id, tier, label, description, highlight, sort_order, price_multiplier')
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

  // 플랜별 할인 조회 (컬럼 없으면 무시 — 마이그레이션 적용 전 안전)
  const discountMap: Record<string, { rate: number; amount: number }> = {}
  {
    const { data: dRows, error: dErr } = await db
      .from('quote_tiers')
      .select('id, discount_rate, discount_amount' as never)
      .eq('business_id', businessId)
    if (!dErr && dRows) {
      for (const r of dRows as unknown as Array<{ id: string; discount_rate: number | null; discount_amount: number | null }>) {
        discountMap[r.id] = { rate: Number(r.discount_rate) || 0, amount: Number(r.discount_amount) || 0 }
      }
    }
  }
  const tiersWithDiscount = (tiers ?? []).map((t) => ({
    ...t,
    discount_rate: discountMap[t.id]?.rate ?? 0,
    discount_amount: discountMap[t.id]?.amount ?? 0,
  }))

  // 가격 심리 가이드용 기준가 — 정액 서비스 가격의 중앙값(없으면 10만원)
  const flatBases = (services ?? [])
    .filter((s) => s.unit !== '평당')
    .map((s) => s.base_price)
    .sort((a, b) => a - b)
  const referenceBase = flatBases.length > 0 ? flatBases[Math.floor(flatBases.length / 2)] : 100000

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
          tiers={tiersWithDiscount}
          referenceBase={referenceBase}
          currentBundles={currentBundles}
        />
      )}
    </div>
  )
}
