import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Users } from 'lucide-react'
import { ReengagementReviewList, type ReengagementItem } from '@/components/dashboard/reengagement-review-list'

export default async function ReengagementPage() {
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
  const businessId = profile.business_id

  // 검토 대기(pending) 재방문 유도 건 — reengagement_dispatches는 아직 타입 미반영
  const looseDb = db as unknown as SupabaseClient
  const { data: rows } = (await looseDb
    .from('reengagement_dispatches')
    .select('id, customer_name, customer_phone, last_service, months_since, message')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })) as unknown as {
    data:
      | Array<{
          id: string
          customer_name: string | null
          customer_phone: string
          last_service: string | null
          months_since: number | null
          message: string
        }>
      | null
  }

  const items: ReengagementItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    customerName: r.customer_name ?? '고객',
    customerPhone: r.customer_phone,
    lastService: r.last_service,
    monthsSince: r.months_since,
    message: r.message,
  }))

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          대시보드
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-emerald-600" />
          재방문 유도
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          한동안 안 오신 단골 고객에게 보낼 <b>개인화 메시지</b>를 준비했어요. 필요하면 문구를 다듬고, 복사해 카톡으로 보낸 뒤 <b>보냈어요</b>를 눌러요.
        </p>
      </div>

      <ReengagementReviewList items={items} />
    </div>
  )
}
