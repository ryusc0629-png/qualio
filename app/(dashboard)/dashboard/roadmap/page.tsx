import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RoadmapPlanner, type LeadOption } from '@/components/dashboard/roadmap-planner'
import { Route } from 'lucide-react'

export default async function RoadmapPage() {
  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  const businessId = profile?.business_id
  if (!businessId) redirect('/dashboard')

  // 주소가 있는 리드만 (방문 대상 후보) + 기본 출발지(업체 주소)
  const [leadsRes, bizRes] = await Promise.all([
    db
      .from('leads')
      .select('id, company_name, address, phone')
      .eq('business_id', businessId)
      .not('address', 'is', null)
      .order('created_at', { ascending: false }),
    db.from('businesses').select('address').eq('id', businessId).maybeSingle(),
  ])

  const leads: LeadOption[] = (leadsRes.data ?? [])
    .filter((l) => (l.address ?? '').trim().length > 0)
    .map((l) => ({
      id: l.id,
      name: l.company_name,
      address: l.address ?? '',
      phone: l.phone ?? '',
    }))

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Route className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">영업 동선</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          방문할 곳을 넣으면 하루씩 돌기 좋은 순서로 코스를 짜드려요. 차에서 순서대로 따라 돌면 됩니다.
        </p>
      </div>

      <RoadmapPlanner leads={leads} defaultStart={bizRes.data?.address ?? ''} />
    </div>
  )
}
