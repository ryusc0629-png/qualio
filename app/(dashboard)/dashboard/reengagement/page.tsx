import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Users } from 'lucide-react'
import { ReengagementReviewList, type ReengagementItem } from '@/components/dashboard/reengagement-review-list'
import { SuggestionReviewList, type SuggestionItem } from '@/components/dashboard/suggestion-review-list'
import { formatDate } from '@/lib/format/datetime'

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

  // 현장에서 올린 '다음에 제안할 서비스' — 승인해야 정해진 날짜에 문자가 나간다
  const { data: sugRows } = (await looseDb
    .from('reengagement_dispatches')
    .select('id, customer_name, customer_phone, service_name, reason, due_at, message, fail_reason, workers!worker_id(name)')
    .eq('business_id', businessId)
    .eq('source', 'field')
    .eq('status', 'pending')
    .order('due_at', { ascending: true })) as unknown as {
    data:
      | Array<{
          id: string
          customer_name: string | null
          customer_phone: string
          service_name: string | null
          reason: string | null
          due_at: string | null
          message: string
          fail_reason: string | null
          workers: { name: string } | { name: string }[] | null
        }>
      | null
  }

  // 등록된 서비스 이름 — 현장이 직접 적은 이름을 가려내 '서비스로 등록' 버튼을 띄운다
  const { data: svcRows } = await db
    .from('service_items')
    .select('name')
    .eq('business_id', businessId)
    .is('deleted_at', null)
  const registeredNames = new Set((svcRows ?? []).map((s) => s.name))

  // 이 손님에게 문자를 보낼 수 있는지 — 동의했고 거부한 적 없어야 한다.
  // 6개월 뒤에야 "못 보냈어요"를 알리면 늦다. 승인 화면에서 미리 알려준다.
  const [{ data: consentRows }, { data: optoutRows }] = await Promise.all([
    looseDb.from('marketing_consents').select('phone').eq('business_id', businessId),
    looseDb.from('marketing_optouts').select('phone').eq('business_id', businessId),
  ]) as unknown as [{ data: { phone: string }[] | null }, { data: { phone: string }[] | null }]
  const consented = new Set((consentRows ?? []).map((r) => r.phone))
  const optedOut = new Set((optoutRows ?? []).map((r) => r.phone))
  const smsAllowed = (phone: string) => {
    const p = phone.replace(/[^0-9]/g, '')
    return consented.has(p) && !optedOut.has(p)
  }

  const suggestions: SuggestionItem[] = (sugRows ?? [])
    .filter((r) => !!r.service_name)
    .map((r) => {
      const worker = Array.isArray(r.workers) ? r.workers[0] : r.workers
      return {
        id: r.id,
        customerName: r.customer_name ?? '고객',
        customerPhone: r.customer_phone,
        serviceName: r.service_name!,
        reason: r.reason,
        workerName: worker?.name ?? null,
        dueLabel: r.due_at
          ? formatDate(r.due_at, { year: 'numeric', month: 'long' })
          : '승인 즉시',
        message: r.message,
        unregistered: !registeredNames.has(r.service_name!),
        failReason: r.fail_reason,
        smsAllowed: smsAllowed(r.customer_phone),
      }
    })

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
          다시 연락할 곳
        </h1>
      </div>

      {/* 현장이 올린 제안이 먼저 — 근거가 그 현장 기록이라 성사율이 다르다 */}
      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">현장에서 올린 제안</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            직원이 현장에서 보고 고른 것들이에요. <b>승인해야</b> 정해진 날짜에 문자가 나가고, 그 전엔 고객에게 아무것도 안 갑니다.
          </p>
        </div>
        <SuggestionReviewList items={suggestions} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">한동안 안 오신 단골</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            보낼 <b>문구</b>를 준비했어요. 다듬어서 복사해 카톡으로 보낸 뒤 <b>보냈어요</b>를 눌러요.
          </p>
        </div>
        <ReengagementReviewList items={items} />
      </section>
    </div>
  )
}
