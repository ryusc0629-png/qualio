import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddClientForm } from '@/components/dashboard/add-client-form'
import { EditCustomerButton } from '@/components/dashboard/edit-customer-button'
import { DeleteCustomerButton } from '@/components/dashboard/delete-customer-button'
import { DeleteLeadButton } from '@/components/dashboard/delete-lead-button'
import { LeadStatusSelect } from '@/components/dashboard/lead-status-select'
import { RegisterFromLeadButton } from '@/components/dashboard/register-from-lead-button'
import { ContractStatusSelect } from '@/components/dashboard/contract-status-select'
import { formatFrequency } from '@/lib/utils/frequency'
import { Phone, MapPin, Calendar, TrendingUp } from 'lucide-react'

// ── 타입 ────────────────────────────────────────────────

type CustomerRow = {
  id: string
  name: string
  phone: string | null
  address: string | null
  category: string | null
  type: string
  notes: string | null
  lead_id: string | null
  created_at: string
}

type LeadRow = {
  id: string
  company_name: string
  phone: string | null
  address: string | null
  category: string | null
  status: string
  next_follow_up_date: string | null
  notes: string | null
  created_at: string
}

type ContractRow = {
  id: string
  customer_id: string
  service_type: string
  frequency: string
  contract_price: number
  status: string
}

type UnifiedRow =
  | {
      kind: 'customer'
      customer: CustomerRow
      ltv: number
      bookingCount: number
      lastVisitDate: string | null
      activeContract: ContractRow | null
      hasAnyContract: boolean
      sortScore: number
    }
  | {
      kind: 'lead'
      lead: LeadRow
      isOverdue: boolean
      alreadyRegistered: boolean
      sortScore: number
    }

// ── 상수 ────────────────────────────────────────────────

const CUSTOMER_STATUS: Record<string, { label: string; className: string }> = {
  contract:   { label: '정기계약',   className: 'bg-emerald-100 text-emerald-700' },
  repeat:     { label: '재방문 고객', className: 'bg-primary/10 text-primary' },
  first:      { label: '첫방문 완료', className: 'bg-blue-100 text-blue-700' },
  registered: { label: '등록됨',     className: 'bg-gray-100 text-gray-500' },
}

const LEAD_STATUS: Record<string, { label: string; className: string; priority: number }> = {
  follow_up:  { label: '팔로업',   className: 'bg-amber-100 text-amber-700',   priority: 0 },
  quoted:     { label: '견적중',   className: 'bg-violet-100 text-violet-700', priority: 1 },
  contacted:  { label: '1차방문', className: 'bg-blue-100 text-blue-700',     priority: 2 },
  new:        { label: '신규',     className: 'bg-gray-100 text-gray-600',     priority: 3 },
  contracted: { label: '계약완료', className: 'bg-emerald-100 text-emerald-700', priority: 4 },
  rejected:   { label: '거절',     className: 'bg-red-100 text-red-600',       priority: 5 },
}

// ── 페이지 ────────────────────────────────────────────────

export default async function ClientsPage() {
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

  const [
    { data: customers },
    { data: contracts },
    { data: completedBookings },
    { data: leads },
    { data: registeredLeadRows },
  ] = await Promise.all([
    db.from('customers')
      .select('id, name, phone, address, category, type, notes, lead_id, created_at')
      .eq('business_id', businessId),

    db.from('contracts')
      .select('id, customer_id, service_type, frequency, contract_price, status')
      .eq('business_id', businessId),

    // 전화번호로 LTV 계산 (bookings에 customer_id FK 없음)
    db.from('bookings')
      .select('customer_phone, final_price, scheduled_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .is('deleted_at', null),

    db.from('leads')
      .select('id, company_name, phone, address, category, status, next_follow_up_date, notes, created_at')
      .eq('business_id', businessId),

    db.from('customers')
      .select('lead_id')
      .eq('business_id', businessId)
      .not('lead_id', 'is', null),
  ])

  // 전화번호 → 예약 실적 맵
  const bookingMap: Record<string, { ltv: number; count: number; lastDate: string }> = {}
  for (const b of completedBookings ?? []) {
    if (!b.customer_phone) continue
    const prev = bookingMap[b.customer_phone]
    if (prev) {
      prev.ltv += b.final_price ?? 0
      prev.count += 1
      if ((b.scheduled_at ?? '') > prev.lastDate) prev.lastDate = b.scheduled_at ?? ''
    } else {
      bookingMap[b.customer_phone] = {
        ltv: b.final_price ?? 0,
        count: 1,
        lastDate: b.scheduled_at ?? '',
      }
    }
  }

  // customer_id → 계약 맵
  const contractMap: Record<string, ContractRow[]> = {}
  for (const c of contracts ?? []) {
    if (!contractMap[c.customer_id]) contractMap[c.customer_id] = []
    contractMap[c.customer_id]!.push(c)
  }

  const registeredLeadIds = new Set((registeredLeadRows ?? []).map((r) => r.lead_id))
  const today = new Date().toISOString().slice(0, 10)

  // ── 통합 행 생성 ──

  const rows: UnifiedRow[] = []

  for (const customer of customers ?? []) {
    const booking = customer.phone ? bookingMap[customer.phone] : undefined
    const customerContracts = contractMap[customer.id] ?? []
    const activeContract = customerContracts.find((c) => c.status === 'active') ?? null
    const hasAnyContract = customerContracts.length > 0
    const ltv = booking?.ltv ?? 0
    const bookingCount = booking?.count ?? 0
    const lastVisitDate = booking?.lastDate ?? null

    // 정렬 점수: 계약 > LTV 내림차순
    const sortScore = activeContract
      ? 10_000_000 + (activeContract.contract_price * 12)
      : ltv

    rows.push({
      kind: 'customer',
      customer: customer as CustomerRow,
      ltv,
      bookingCount,
      lastVisitDate,
      activeContract,
      hasAnyContract,
      sortScore,
    })
  }

  for (const lead of leads ?? []) {
    if (registeredLeadIds.has(lead.id)) continue // 고객으로 전환됨 → 건너뜀

    const isOverdue = Boolean(
      lead.next_follow_up_date &&
      lead.next_follow_up_date < today &&
      lead.status !== 'contracted' &&
      lead.status !== 'rejected'
    )
    const priority = LEAD_STATUS[lead.status]?.priority ?? 3
    // 리드는 고객보다 항상 아래, 우선순위 높을수록 위
    const sortScore = -1_000_000 + (10 - priority) * 1000 + (isOverdue ? 500 : 0)

    rows.push({
      kind: 'lead',
      lead: lead as LeadRow,
      isOverdue,
      alreadyRegistered: false,
      sortScore,
    })
  }

  rows.sort((a, b) => b.sortScore - a.sortScore)

  // ── 요약 통계 ──

  const totalLTV = rows
    .filter((r): r is Extract<UnifiedRow, { kind: 'customer' }> => r.kind === 'customer')
    .reduce((s, r) => s + r.ltv, 0)

  const monthlyRecurring = (contracts ?? [])
    .filter((c) => c.status === 'active')
    .reduce((s, c) => s + c.contract_price, 0)

  const customerCount = rows.filter((r) => r.kind === 'customer').length
  const leadCount = rows.filter((r) => r.kind === 'lead').length

  // ── 렌더링 ──

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">고객 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">고객 가치(LTV) 순으로 정렬돼요</p>
        </div>
        <AddClientForm />
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">전체</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">
            {customerCount + leadCount}
            <span className="text-sm font-normal text-muted-foreground ml-0.5">명</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">고객 {customerCount} · 잠재 {leadCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">누적 LTV</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">
            {totalLTV > 0
              ? `${Math.round(totalLTV / 10000).toLocaleString('ko-KR')}만`
              : '—'}
            {totalLTV > 0 && <span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">월 정기 매출</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-emerald-600">
            {monthlyRecurring > 0
              ? monthlyRecurring.toLocaleString('ko-KR')
              : '—'}
            {monthlyRecurring > 0 && <span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>}
          </p>
          {monthlyRecurring > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" /> 활성 계약 기준
            </p>
          )}
        </div>
      </div>

      {/* 통합 목록 */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">아직 등록된 고객이 없어요</p>
          <p className="text-xs text-muted-foreground">오른쪽 위 버튼으로 첫 번째 고객을 추가해보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {

            if (row.kind === 'customer') {
              const { customer, ltv, bookingCount, lastVisitDate, activeContract, hasAnyContract } = row
              const hasContract = Boolean(activeContract)
              const statusKey = hasContract ? 'contract' : bookingCount >= 2 ? 'repeat' : bookingCount === 1 ? 'first' : 'registered'
              const statusMeta = CUSTOMER_STATUS[statusKey]!

              return (
                <div
                  key={`customer-${customer.id}`}
                  className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{customer.name}</p>
                        {customer.category && (
                          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {customer.category}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      <div className="mt-1.5 space-y-0.5">
                        {customer.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />
                            {customer.phone}
                          </p>
                        )}
                        {customer.address && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {customer.address}
                          </p>
                        )}
                        {lastVisitDate && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0" />
                            마지막 방문 {new Date(lastVisitDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                            {bookingCount > 1 && ` · 총 ${bookingCount}회 방문`}
                          </p>
                        )}
                      </div>

                      {activeContract && (
                        <div className="mt-2 pt-2 border-t border-border flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            {activeContract.service_type} · {formatFrequency(activeContract.frequency)}
                          </p>
                          <ContractStatusSelect
                            contractId={activeContract.id}
                            currentStatus={activeContract.status}
                          />
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {/* LTV */}
                      <div className="text-right">
                        {ltv > 0 && (
                          <p className="text-base font-bold tabular-nums">
                            {ltv.toLocaleString('ko-KR')}원
                          </p>
                        )}
                        {activeContract && (
                          <p className="text-xs text-emerald-600 font-medium tabular-nums">
                            {activeContract.contract_price.toLocaleString('ko-KR')}원/월
                          </p>
                        )}
                        {ltv === 0 && !activeContract && (
                          <p className="text-xs text-muted-foreground">실적 없음</p>
                        )}
                      </div>

                      {/* 액션 */}
                      <div className="flex items-center gap-1">
                        {customer.phone && (
                          <EditCustomerButton customer={{ ...customer, phone: customer.phone }} />
                        )}
                        <DeleteCustomerButton
                          customerId={customer.id}
                          customerName={customer.name}
                          hasContract={hasAnyContract}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            }

            // ── 리드 카드 ──
            const { lead, isOverdue, alreadyRegistered } = row
            const leadMeta = LEAD_STATUS[lead.status] ?? LEAD_STATUS['new']!

            return (
              <div
                key={`lead-${lead.id}`}
                className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{lead.company_name}</p>
                      {lead.category && (
                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          {lead.category}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${leadMeta.className}`}>
                        {leadMeta.label}
                      </span>
                      {isOverdue && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">
                          연락 지연
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 space-y-0.5">
                      {lead.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          {lead.phone}
                        </p>
                      )}
                      {lead.address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {lead.address}
                        </p>
                      )}
                      {lead.next_follow_up_date && (
                        <p className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                          <Calendar className="h-3 w-3 shrink-0" />
                          다음 연락: {new Date(lead.next_follow_up_date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                          {isOverdue && ' (지났어요)'}
                        </p>
                      )}
                      {lead.notes && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{lead.notes}</p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <p className="text-xs text-muted-foreground">잠재고객</p>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      <LeadStatusSelect leadId={lead.id} currentStatus={lead.status} />
                      {lead.status === 'contracted' && (
                        <RegisterFromLeadButton
                          lead={{
                            id: lead.id,
                            company_name: lead.company_name,
                            phone: lead.phone,
                            address: lead.address,
                            category: lead.category,
                          }}
                          alreadyRegistered={alreadyRegistered}
                        />
                      )}
                      <DeleteLeadButton leadId={lead.id} leadName={lead.company_name} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
