import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { QuoteForm } from './quote-form'

interface Props {
  params: Promise<{ businessId: string }>
}

// 고객용 공개 견적 요청 페이지 — 로그인 불필요
export default async function PublicQuotePage({ params }: Props) {
  const { businessId } = await params

  const db = createServiceClient()

  // 업체 정보 조회
  const { data: business } = await db
    .from('businesses')
    .select('id, name, description')
    .eq('id', businessId)
    .maybeSingle()

  if (!business) notFound()

  // 견적폼 노출 서비스 목록 조회 (show_in_quote=true인 것만)
  const { data: services } = await db
    .from('service_items')
    .select('id, name, base_price, unit, ac_type_prices')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at')

  // ac_type_prices를 올바른 타입으로 변환
  const typedServices = (services ?? []).map((s) => ({
    ...s,
    ac_type_prices: (s.ac_type_prices && typeof s.ac_type_prices === 'object' && !Array.isArray(s.ac_type_prices))
      ? s.ac_type_prices as Record<string, number>
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
