import { createServiceClient } from '@/lib/supabase/server'
import { notFound, permanentRedirect } from 'next/navigation'
import { QuoteForm } from './quote-form'
import { trackPageView } from '@/lib/utils/track-page-view'

interface Props {
  params: Promise<{ businessId: string }>
}

// UUID 형식인지 판별 — 옛 링크(UUID)와 읽기 좋은 주소(slug)를 구분
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 고객용 공개 견적 요청 페이지 — 로그인 불필요
// [businessId] 세그먼트는 UUID(옛 링크) 또는 slug(읽기 좋은 주소) 둘 다 받음
export default async function PublicQuotePage({ params }: Props) {
  const { businessId: raw } = await params
  const idOrSlug = raw.normalize('NFC') // 한글 주소 NFC/NFD 불일치 매칭 실패 방지

  const db = createServiceClient()

  // UUID면 id로, 아니면 slug로 조회
  const { data: business } = await (UUID_RE.test(idOrSlug)
    ? db.from('businesses').select('id, name, description').eq('id', idOrSlug)
    : db.from('businesses').select('id, name, description').eq('slug', idOrSlug)
  ).maybeSingle()

  if (!business) {
    // 옛 주소(slug)로 들어왔으면 현재 주소로 영구 이동(301) — 공유/색인된 링크 보존
    if (!UUID_RE.test(idOrSlug)) {
      const { data: moved } = await db
        .from('businesses')
        .select('slug')
        .contains('previous_slugs' as never, [idOrSlug] as never)
        .maybeSingle() as unknown as { data: { slug: string | null } | null }
      if (moved?.slug) permanentRedirect(`/q/${moved.slug}`)
    }
    notFound()
  }

  const businessId = business.id

  // 견적폼 노출 서비스 목록 조회 + 방문 추적 (병렬 — 추적이 렌더를 지연시키지 않게)
  const [{ data: services }] = await Promise.all([
    db
      .from('service_items')
      .select('id, name, base_price, unit, ac_type_prices, unit_prices, unit_variants')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .order('created_at'),
    trackPageView(db, business.id, 'quote'),
  ])

  // ac_type_prices / unit_prices를 올바른 타입으로 변환
  const typedServices = (services ?? []).map((s) => ({
    ...s,
    ac_type_prices: (s.ac_type_prices && typeof s.ac_type_prices === 'object' && !Array.isArray(s.ac_type_prices))
      ? s.ac_type_prices as Record<string, number>
      : null,
    unit_prices: Array.isArray(s.unit_prices)
      ? s.unit_prices as Array<{ name: string; price: number; variant?: string }>
      : null,
    unit_variants: Array.isArray(s.unit_variants)
      ? s.unit_variants as string[]
      : null,
  }))

  return (
    <QuoteForm
      businessId={business.id}
      businessName={business.name}
      services={typedServices}
    />
  )
}
