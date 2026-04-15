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
    .select('id, name, base_price, unit')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .eq('show_in_quote', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at')

  return (
    <div className="min-h-screen bg-background flex items-start justify-center pt-10 pb-16 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* 업체 헤더 */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">{business.name}</h1>
          {business.description && (
            <p className="text-muted-foreground text-sm">{business.description}</p>
          )}
          <p className="text-muted-foreground text-sm">서비스 정보를 입력하시면 즉시 견적을 확인하실 수 있습니다</p>
        </div>

        {/* 견적 폼 */}
        <div className="rounded-lg border bg-card p-6">
          <QuoteForm businessId={business.id} services={services ?? []} />
        </div>

        <p className="text-center text-xs text-muted-foreground">Powered by 퀄리오</p>
      </div>
    </div>
  )
}
