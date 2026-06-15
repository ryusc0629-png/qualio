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

  const { data: leads, error: leadsError } = await db
    .rpc('get_leads_for_pipeline', { p_business_id: profile.business_id })

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">거래처 관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          상담 중인 거래처와 일반 고객을 단계별로 관리해요
        </p>
      </div>

      {leadsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 break-all">
          DB오류: {leadsError.message}
        </div>
      )}
      {!leadsError && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          조회됨: {leads?.length ?? 0}건 | bizId: {profile.business_id.slice(0, 8)}...
        </div>
      )}

      <PipelineList
        leads={leads ?? []}
        businessId={profile.business_id}
        filterStatus={status}
      />
    </div>
  )
}
