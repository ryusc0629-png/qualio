import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileText } from 'lucide-react'
import { MonthlyReportReviewList, type ReviewItem } from '@/components/dashboard/monthly-report-review-list'

/** 방문 시각을 서울 기준 'YYYY-MM'으로 — Vercel 서버는 UTC라 변환 없이 자르면 월이 밀린다 */
function kstMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 7)
}

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

  // 이번 달 현장 요청 — 리포트를 보내기 전에 처리 여부를 체크하게 한다.
  // 체크가 없으면 거래처가 받는 리포트 상단이 "요청 5건 · 처리 1건"처럼 우리를 깎아먹는다
  // (현장 요청은 처리 여부를 적을 칸이 아예 없었다).
  const customerIds = [...new Set((rows ?? []).map((r) => r.customer_id))]
  const requestsByCustomer = new Map<string, ReviewItem['requests']>()

  if (customerIds.length > 0) {
    const { data: reqRows } = (await looseDb
      .from('bookings')
      .select('id, customer_id, scheduled_at, customer_request, customer_request_done_at')
      .eq('business_id', businessId)
      .in('customer_id', customerIds)
      .not('customer_request', 'is', null)
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: true })) as unknown as {
      data:
        | Array<{
            id: string
            customer_id: string
            scheduled_at: string
            customer_request: string | null
            customer_request_done_at: string | null
          }>
        | null
    }

    for (const b of reqRows ?? []) {
      if (!b.customer_request?.trim()) continue
      const list = requestsByCustomer.get(b.customer_id) ?? []
      list.push({
        bookingId: b.id,
        date: b.scheduled_at,
        note: b.customer_request.trim(),
        done: !!b.customer_request_done_at,
      })
      requestsByCustomer.set(b.customer_id, list)
    }
  }

  const items: ReviewItem[] = (rows ?? []).map((r) => {
    const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
    return {
      id: r.id,
      customerId: r.customer_id,
      customerName: cust?.name ?? '거래처',
      period: r.period,
      completedVisits: r.completed_visits,
      // 해당 달 방문만 남긴다 — 리포트에 나가는 것과 같은 범위여야 헷갈리지 않는다.
      // ⚠️ ISO 문자열을 그대로 자르면 안 된다: 9월 1일 오전 8시(KST)는 UTC로 8월 31일이라
      // 8월 리포트에 딸려 들어간다. 반드시 KST로 바꾼 뒤 월을 본다.
      requests: (requestsByCustomer.get(r.customer_id) ?? []).filter(
        (q) => kstMonth(q.date) === r.period,
      ),
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
