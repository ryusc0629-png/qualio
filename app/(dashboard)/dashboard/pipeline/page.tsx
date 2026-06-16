import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PipelineList } from './pipeline-list'
import { buildLiveStatusMap, normalizePhone, type LiveStatus } from '@/lib/utils/lead-live-status'

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams

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

  const [
    { data: leads },
    { data: quotes },
    { data: convertedRows },
    { data: publicQuotes },
    { data: bookings },
  ] = await Promise.all([
    db.rpc('get_leads_for_pipeline', { p_business_id: profile.business_id }),
    // 거래처별 견적 정보 (전환 시 자동 채움용)
    db
      .from('b2b_quotes')
      .select('lead_id, total_amount, frequency, items')
      .eq('business_id', profile.business_id),
    // 이미 고객으로 전환된 거래처 (customers.lead_id 연결)
    db
      .from('customers')
      .select('lead_id')
      .eq('business_id', profile.business_id)
      .not('lead_id', 'is', null),
    // 온라인 견적 요청 (일반 고객 실제 상태 계산용)
    db
      .from('quotes')
      .select('customer_phone, status')
      .eq('business_id', profile.business_id),
    // 예약 (일반 고객 실제 상태 계산용)
    db
      .from('bookings')
      .select('customer_phone, status, scheduled_at')
      .eq('business_id', profile.business_id)
      .is('deleted_at', null),
  ])

  // 거래처별 견적 요약 맵
  const quoteByLead: Record<string, { total_amount: number; frequency: string | null; serviceName: string | null }> = {}
  for (const q of quotes ?? []) {
    if (!q.lead_id) continue
    const items = Array.isArray(q.items) ? (q.items as { name?: string }[]) : []
    quoteByLead[q.lead_id] = {
      total_amount: q.total_amount ?? 0,
      frequency: q.frequency ?? null,
      serviceName: items[0]?.name ?? null,
    }
  }

  const convertedLeadIds = (convertedRows ?? []).map((r) => r.lead_id).filter((id): id is string => Boolean(id))

  // 일반 고객 실제 상태: 전화번호로 견적·예약 연결
  const liveStatusByPhone = buildLiveStatusMap(publicQuotes ?? [], bookings ?? [])
  const liveStatusByLeadId: Record<string, LiveStatus> = {}
  for (const lead of (leads ?? []) as { id: string; phone: string | null; customer_type: string }[]) {
    if (lead.customer_type === 'company') continue // 일반 고객만 자동 상태
    const status = liveStatusByPhone.get(normalizePhone(lead.phone))
    if (status) liveStatusByLeadId[lead.id] = status
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">거래처 관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          상담 중인 거래처와 일반 고객을 단계별로 관리해요
        </p>
      </div>

      <PipelineList
        leads={leads ?? []}
        businessId={profile.business_id}
        filterStatus={status}
        quoteByLead={quoteByLead}
        convertedLeadIds={convertedLeadIds}
        liveStatusByLeadId={liveStatusByLeadId}
      />
    </div>
  )
}
