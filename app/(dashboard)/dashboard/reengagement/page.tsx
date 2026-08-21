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
    // ⚠️ source를 안 거르면 현장 제안(source='field')이 아래 구역에도 똑같이 뜬다.
    //    같은 건이 두 번 보이면 사장님은 "두 번 연락해야 하나?" 하고 헷갈린다.
    .eq('source', 'auto_90d')
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

  // 현장에서 올린 '다음에 제안할 서비스'.
  // 아직 결정 안 한 것(pending)과 승인해둔 것(scheduled)을 함께 가져와 화면에서 갈라 보여준다.
  // 승인한 건이 아무 데도 안 보이면 "내가 승인한 게 어디 갔지?"가 된다.
  const { data: sugRows } = (await looseDb
    .from('reengagement_dispatches')
    .select('id, customer_name, customer_phone, service_name, reason, due_at, message, fail_reason, status, channel, workers!worker_id(name)')
    .eq('business_id', businessId)
    .eq('source', 'field')
    .in('status', ['pending', 'scheduled'])
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
          status: string
          channel: string
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
        status: r.status,
        channel: r.channel,
        isDue: !!r.due_at && new Date(r.due_at) <= new Date(),
      }
    })

  // 상태가 아니라 '지금 뭘 해야 하는가'로 가른다.
  //   오늘 연락 — 기한이 됐고 승인이 끝난 것(크론이 pending으로 되돌리며 사유를 남긴다)
  //   승인 대기 — 아직 사장님이 날짜·방법을 안 정한 것
  //   예약됨   — 정해두고 그날을 기다리는 것
  const dueNow   = suggestions.filter((s) => s.status === 'pending' && s.isDue)
  const waiting  = suggestions.filter((s) => s.status === 'pending' && !s.isDue)
  const reserved = suggestions.filter((s) => s.status === 'scheduled')

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

      {/* 지금 해야 하는 것부터 — 오늘 연락 → 결정 대기 → 예약됨 순서로 내려간다.
          상태로 나누면 사장님은 "그래서 지금 뭘 하라는 거지?"를 다시 계산해야 한다. */}
      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">오늘 연락할 곳</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            연락드리기로 한 날이 됐어요. 준비된 문구를 보고 <b>전화 한 통</b>이면 됩니다.
          </p>
        </div>
        {/* 둘 다 비면 빈 안내가 두 번 뜬다 — 하나만 보여준다 */}
        {dueNow.length === 0 && items.length === 0 ? (
          <SuggestionReviewList items={[]} emptyText="오늘 연락드릴 곳은 없어요" />
        ) : (
          <>
            {dueNow.length > 0 && <SuggestionReviewList items={dueNow} />}
            {items.length > 0 && <ReengagementReviewList items={items} />}
          </>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">승인 기다리는 제안</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            직원이 현장에서 보고 고른 것들이에요. <b>언제 연락할지 정해주시면</b> 그날 알려드립니다.
            그 전엔 고객에게 아무것도 안 갑니다.
          </p>
        </div>
        <SuggestionReviewList items={waiting} />
      </section>

      {reserved.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">예약해둔 연락 {reserved.length}건</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              정해두신 것들이에요. 그날이 되면 위 <b>오늘 연락할 곳</b>으로 올라옵니다.
            </p>
          </div>
          <SuggestionReviewList items={reserved} variant="reserved" />
        </section>
      )}

    </div>
  )
}
