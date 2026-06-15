import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PipelineList } from './pipeline-list'

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

  const { data: leads } = await db
    .from('leads')
    .select('id, company_name, contact_name, phone, address, status, customer_type, monthly_budget, next_follow_up_date, notes, created_at')
    .eq('business_id', profile.business_id)
    .order('created_at', { ascending: false })

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
      />
    </div>
  )
}
