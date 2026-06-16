import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LeadDetail } from './lead-detail'
import { getLiveStatusForPhone } from '@/lib/utils/lead-live-status'

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>
}) {
  const { leadId } = await params

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

  const [leadRpcResult, activitiesResult, quoteResult, convertedResult, publicQuotesResult, bookingsResult] = await Promise.all([
    db.rpc('get_lead_detail', { p_id: leadId, p_business_id: profile.business_id }),
    db
      .from('lead_activities')
      .select('id, type, content, activity_at, created_at')
      .eq('lead_id', leadId)
      .eq('business_id', profile.business_id)
      .order('activity_at', { ascending: false }),
    db
      .from('b2b_quotes')
      .select('id, quote_number, valid_until, items, total_amount, tax_included, conditions, site_name, site_address, site_area, frequency, worker_count, spec_content')
      .eq('lead_id', leadId)
      .eq('business_id', profile.business_id)
      .maybeSingle(),
    // 이미 고객으로 전환됐는지 확인 (customers.lead_id 연결)
    db
      .from('customers')
      .select('id')
      .eq('lead_id', leadId)
      .eq('business_id', profile.business_id)
      .maybeSingle(),
    // 온라인 견적·예약 (일반 고객 실제 상태 계산용)
    db
      .from('quotes')
      .select('customer_phone, status')
      .eq('business_id', profile.business_id),
    db
      .from('bookings')
      .select('customer_phone, status, scheduled_at')
      .eq('business_id', profile.business_id)
      .is('deleted_at', null),
  ])

  const leadData = Array.isArray(leadRpcResult.data) ? leadRpcResult.data[0] : null
  if (!leadData) notFound()

  const alreadyConverted = Boolean(convertedResult.data)

  // 일반 고객만 견적·예약 기반 자동 상태 표시
  const liveStatus = leadData.customer_type === 'company'
    ? null
    : getLiveStatusForPhone(leadData.phone, publicQuotesResult.data ?? [], bookingsResult.data ?? [])

  const rawQuote = quoteResult.data
  const existingQuote = rawQuote
    ? {
        ...rawQuote,
        items: (Array.isArray(rawQuote.items) ? rawQuote.items : []) as {
          name: string; unit: string; qty: number; unit_price: number
        }[],
      }
    : null

  return (
    <div className="max-w-2xl mx-auto">
      <LeadDetail
        lead={leadData}
        activities={activitiesResult.data ?? []}
        existingQuote={existingQuote}
        alreadyConverted={alreadyConverted}
        liveStatus={liveStatus}
      />
    </div>
  )
}
