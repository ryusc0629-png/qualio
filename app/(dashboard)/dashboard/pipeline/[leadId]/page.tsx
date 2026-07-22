import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LeadDetail } from './lead-detail'
import { getLiveStatusForPhone } from '@/lib/utils/lead-live-status'

// RPC 대신 직접 쿼리 사용 — RPC 가용성에 무관하게 안정적으로 데이터 조회

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

  const [leadResult, activitiesResult, quoteResult, convertedResult, publicQuotesResult, bookingsResult] = await Promise.all([
    db.from('leads')
      .select('id, company_name, contact_name, contact_title, email, phone, address, status, customer_type, monthly_budget, next_follow_up_date, notes, created_at')
      .eq('id', leadId)
      .eq('business_id', profile.business_id)
      .maybeSingle(),
    db
      .from('lead_activities')
      .select('id, type, content, activity_at, created_at')
      .eq('lead_id', leadId)
      .eq('business_id', profile.business_id)
      .order('activity_at', { ascending: false }),
    db
      .from('b2b_quotes')
      // job_type은 database.ts 타입 미반영 → select 문자열 as never, 결과는 아래서 명시 타입 단언
      // 한 거래처에 여러 장 가능 → 전부 가져와 만든 순서(오래된→최신)로 목록에 표시
      .select('id, public_token, title, quote_number, valid_until, items, total_amount, tax_included, conditions, site_name, site_address, site_area, frequency, worker_count, spec_content, job_type, created_at' as never)
      .eq('lead_id', leadId)
      .eq('business_id', profile.business_id)
      .order('created_at' as never, { ascending: true }),
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

  const leadData = leadResult.data
  if (!leadData) notFound()

  const alreadyConverted = Boolean(convertedResult.data)

  // 일반 고객만 견적·예약 기반 자동 상태 표시
  const liveStatus = leadData.customer_type === 'company'
    ? null
    : getLiveStatusForPhone(leadData.phone, publicQuotesResult.data ?? [], bookingsResult.data ?? [])

  const rawQuotes = (quoteResult.data ?? []) as unknown as {
    id: string
    public_token: string | null
    title: string | null
    quote_number: string | null
    valid_until: string | null
    items: unknown
    total_amount: number
    tax_included: boolean
    conditions: string | null
    site_name: string | null
    site_address: string | null
    site_area: string | null
    frequency: string | null
    worker_count: number | null
    spec_content: string | null
    job_type: string | null
  }[]
  const quotes = rawQuotes.map((q) => ({
    ...q,
    items: (Array.isArray(q.items) ? q.items : []) as {
      name: string; unit: string; qty: number; unit_price: number
    }[],
  }))

  return (
    <div className="max-w-2xl mx-auto">
      <LeadDetail
        lead={leadData}
        activities={activitiesResult.data ?? []}
        quotes={quotes}
        alreadyConverted={alreadyConverted}
        liveStatus={liveStatus}
      />
    </div>
  )
}
