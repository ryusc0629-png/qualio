import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileText } from 'lucide-react'
import { MonthlyReportReviewList, type ReviewItem } from '@/components/dashboard/monthly-report-review-list'

export default async function MonthlyReportsPage() {
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

  // 검토 대기(pending) 리포트 + 거래처명
  // monthly_report_dispatches는 아직 database.ts 타입에 없어 느슨한 클라이언트로 접근
  const looseDb = db as unknown as SupabaseClient
  const { data: rows } = (await looseDb
    .from('monthly_report_dispatches')
    .select('id, customer_id, period, completed_visits, customers!customer_id(name)')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })) as unknown as {
    data:
      | Array<{
          id: string
          customer_id: string
          period: string
          completed_visits: number
          customers: { name: string } | { name: string }[] | null
        }>
      | null
  }

  const items: ReviewItem[] = (rows ?? []).map((r) => {
    const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
    return {
      id: r.id,
      customerId: r.customer_id,
      customerName: cust?.name ?? '거래처',
      period: r.period,
      completedVisits: r.completed_visits,
    }
  })

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
          <FileText className="h-6 w-6 text-emerald-600" />
          보낼 거래처 리포트
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          지난달 작업 내역을 거래처 담당자에게 보내주세요. 미리보기로 확인하고, 링크를 복사해 전달한 뒤 <b>보냈어요</b>를 눌러요.
        </p>
      </div>

      <MonthlyReportReviewList items={items} businessId={businessId} />
    </div>
  )
}
