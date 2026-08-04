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

  // ── 앵커링 온보딩용 실데이터: 손님이 실제로 어떤 플랜을 골랐나(bookings.selected_tier) ──
  // 3단계(better_price 있는) 견적에서 이어진 예약만 집계 → 지어낸 수치가 아닌 '내 손님 실제 선택률'.
  const { data: tierBookings } = await db
    .from('bookings')
    .select('selected_tier, quotes!quote_id(better_price)' as never)
    .eq('business_id', businessId)
    .not('quote_id', 'is', null)
    .is('deleted_at', null) as unknown as {
      data: { selected_tier: string | null; quotes: { better_price: number | null } | null }[] | null
    }
  const tierChoices = (tierBookings ?? []).filter((b) => b.quotes?.better_price != null)
  const totalChoices = tierChoices.length
  // 강조(추천)로 표시된 플랜 — 없으면 가운데(better)를 기본 추천으로 본다
  const highlightTier = tiers?.find((t) => t.highlight) ?? tiers?.find((t) => t.tier === 'better') ?? null
  const highlightKey = highlightTier?.tier ?? 'better'
  const highlightLabel = highlightTier?.label ?? '추천'
  const highlightChoices = tierChoices.filter((b) => (b.selected_tier ?? 'good') === highlightKey).length
  const highlightRate = totalChoices > 0 ? Math.round((highlightChoices / totalChoices) * 100) : 0
  // 표본이 너무 적으면(=우연) 수치 대신 원리로 유도. 5건 이상부터 실데이터 노출.
  const MIN_SELECTIONS = 5
  const hasEnoughData = totalChoices >= MIN_SELECTIONS

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">견적 플랜 설정</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          기본 / 추천 / 프리미엄 각 플랜에 포함할 서비스를 선택하세요. 전문가 데이터로 최적 조합을 추천해드립니다.
        </p>
      </div>

      {/* ── 앵커링 온보딩 — 3단계로 묶고 '추천'을 정하도록 유도 ── */}
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🎯</span>
          <p className="text-sm font-semibold text-emerald-800">
            3단계로 묶으면 객단가가 올라가요
          </p>
        </div>

        {hasEnoughData ? (
          <>
            <p className="mt-2 text-2xl font-extrabold text-emerald-700 tracking-tight">
              손님 {totalChoices}명 중 {highlightRate}%가 ‘{highlightLabel}’을 골랐어요
            </p>
            <p className="mt-1.5 text-sm text-emerald-900/80">
              가격이 하나면 ‘비싸다·싸다’만 따지지만, 3개를 보여주면 손님은 극단을 피하고 가운데를 골라요.
              그래서 <b>가장 팔고 싶은 구성을 ‘{highlightLabel}’ 플랜에 두는 것</b>이 매출을 가장 크게 올려요.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-emerald-900/80 leading-relaxed">
              가격이 <b>하나</b>면 손님은 ‘비싸다·싸다’만 따져요. 하지만 <b>기본·추천·프리미엄 3개</b>를 보여주면,
              손님은 극단(가장 싼 것·가장 비싼 것)을 피하고 <b>가운데(추천)</b>를 고르는 경향이 있어요.
            </p>
            <p className="mt-2 text-sm text-emerald-900/80 leading-relaxed">
              그러니 아래에서 <b>가장 팔고 싶은 구성</b>을 <b>‘추천 플랜’</b>으로 표시해 두세요.
              손님이 실제로 어떤 플랜을 고르는지는 <b>견적이 쌓이면 여기에 숫자</b>로 보여드릴게요.
            </p>
          </>
        )}

        <p className="mt-3 pt-3 border-t border-emerald-100 text-xs text-emerald-900/60 leading-relaxed">
          {hasEnoughData
            ? '이 숫자는 지어낸 게 아니라, 3단계 견적을 받은 실제 손님들이 고른 결과예요.'
            : '심리학에서 ‘가운데를 고르는 경향(타협 효과)’이라고 불러요. 우리 손님 실제 데이터는 견적이 쌓이는 대로 채워집니다.'}
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
