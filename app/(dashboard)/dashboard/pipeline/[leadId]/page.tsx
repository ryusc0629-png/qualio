import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LeadDetail } from './lead-detail'

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

  const [leadResult, activitiesResult] = await Promise.all([
    db
      .from('leads')
      .select('id, company_name, contact_name, phone, address, status, customer_type, monthly_budget, next_follow_up_date, notes, created_at')
      .eq('id', leadId)
      .eq('business_id', profile.business_id)
      .maybeSingle(),
    db
      .from('lead_activities')
      .select('id, type, content, activity_at, created_at')
      .eq('lead_id', leadId)
      .eq('business_id', profile.business_id)
      .order('activity_at', { ascending: false }),
  ])

  if (!leadResult.data) notFound()

  return (
    <div className="max-w-2xl mx-auto">
      <LeadDetail
        lead={leadResult.data}
        activities={activitiesResult.data ?? []}
      />
    </div>
  )
}
