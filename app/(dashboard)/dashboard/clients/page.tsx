import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AddClientForm } from '@/components/dashboard/add-client-form'
import { EditCustomerButton } from '@/components/dashboard/edit-customer-button'
import { DeleteCustomerButton } from '@/components/dashboard/delete-customer-button'
import { ContractStatusSelect } from '@/components/dashboard/contract-status-select'
import { formatFrequency } from '@/lib/utils/frequency'
import { Phone, MapPin, Calendar, TrendingUp, ChevronRight, Building2, User, Archive } from 'lucide-react'

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
  status: string
  customer_type: string
  monthly_budget: number | null
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

type B2bQuoteRow = {
  lead_id: string | null
  total_amount: number
  frequency: string | null
}

// ── 상수 ────────────────────────────────────────────────

const CUSTOMER_STATUS: Record<string, { label: string; className: string }> = {
  contract:   { label: '정기계약',    className: 'bg-emerald-100 text-emerald-700' },
  repeat:     { label: '재방문 고객', className: 'bg-primary/10 text-primary' },
  first:      { label: '첫방문 완료', className: 'bg-blue-100 text-blue-700' },
  registered: { label: '등록됨',      className: 'bg-gray-100 text-gray-500' },
}

const PIPELINE_STAGE: Record<string, { text: string; color: string }> = {
  new:         { text: '새 문의',   color: 'bg-gray-100 text-gray-700' },
  contacted:   { text: '연락함',    color: 'bg-blue-100 text-blue-700' },
  follow_up:   { text: '현장 방문', color: 'bg-indigo-100 text-indigo-700' },
  quoted:      { text: '견적 보냄', color: 'bg-amber-100 text-amber-700' },
  negotiating: { text: '금액 협의', color: 'bg-orange-100 text-orange-700' },
  contracted:  { text: '계약 완료', color: 'bg-green-100 text-green-700' },
  rejected:    { text: '포기',      color: 'bg-red-100 text-red-600' },
}

const TABS = [
  { key: 'all',        label: '전체' },
  { key: 'individual', label: '개인·일반 고객' },
  { key: 'company',    label: '정기계약·법인 고객' },
]

const SORT_OPTIONS = [
  { key: 'ltv_desc', label: 'LTV 높은순' },
  { key: 'ltv_asc',  label: 'LTV 낮은순' },
  { key: 'newest',   label: '최신순' },
  { key: 'oldest',   label: '오래된순' },
]

// ── URL 파라미터 헬퍼 ────────────────────────────────────

function buildHref(params: { type?: string; sort?: string; show_archived?: string }) {
  const p = new URLSearchParams()
  if (params.type && params.type !== 'all') p.set('type', params.type)
  if (params.sort && params.sort !== 'ltv_desc') p.set('sort', params.sort)
  if (params.show_archived === '1') p.set('show_archived', '1')
  const qs = p.toString()
  return `/dashboard/clients${qs ? '?' + qs : ''}`
}

// ── 페이지 ────────────────────────────────────────────────

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string; show_archived?: string }>
}) {
  const { type, sort = 'ltv_desc', show_archived } = await searchParams
  const activeTab = ['individual', 'company'].includes(type ?? '') ? type! : 'all'
  const showArchived = show_archived === '1'

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
    { data: b2bQuotes },
  ] = await Promise.all([
    db.from('customers')
      .select('id, name, phone, address, category, type, notes, lead_id, created_at')
      .eq('business_id', businessId),

    db.from('contracts')
      .select('id, customer_id, service_type, frequency, contract_price, status')
      .eq('business_id', businessId),

    db.from('bookings')
      .select('customer_phone, final_price, scheduled_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .is('deleted_at', null),

    db.from('leads')
      .select('id, company_name, phone, address, status, customer_type, monthly_budget, next_follow_up_date, notes, created_at')
      .eq('business_id', businessId),

    db.from('customers')
      .select('lead_id')
      .eq('business_id', businessId)
      .not('lead_id', 'is', null),

    db.from('b2b_quotes')
      .select('lead_id, total_amount, frequency')
      .eq('business_id', businessId),
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
      bookingMap[b.customer_phone] = { ltv: b.final_price ?? 0, count: 1, lastDate: b.scheduled_at ?? '' }
    }
  }

  const contractMap: Record<string, ContractRow[]> = {}
  for (const c of contracts ?? []) {
    if (!contractMap[c.customer_id]) contractMap[c.customer_id] = []
    contractMap[c.customer_id]!.push(c)
  }

  const b2bQuoteMap: Record<string, B2bQuoteRow> = {}
  for (const q of b2bQuotes ?? []) {
    if (q.lead_id) b2bQuoteMap[q.lead_id] = q
  }

  const registeredLeadIds = new Set((registeredLeadRows ?? []).map((r) => r.lead_id))
  const today = new Date().toISOString().slice(0, 10)

  // ── 정렬 함수 ──

  function sortCustomers(list: CustomerRow[]): CustomerRow[] {
    const withLtv = list.map(c => {
      const bookingLtv = c.phone ? (bookingMap[c.phone]?.ltv ?? 0) : 0
      const activeContract = (contractMap[c.id] ?? []).find(ct => ct.status === 'active')
      // 활성 계약이 있으면 연간 계약금을 LTV로 우선 사용 (예약 실적보다 높을 때)
      const contractAnnual = activeContract ? activeContract.contract_price * 12 : 0
      return { c, ltv: Math.max(bookingLtv, contractAnnual) }
    })
    if (sort === 'ltv_asc') return withLtv.sort((a, b) => a.ltv - b.ltv).map(x => x.c)
    if (sort === 'newest')  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (sort === 'oldest')  return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
    return withLtv.sort((a, b) => b.ltv - a.ltv).map(x => x.c)
  }

  function sortLeads(list: LeadRow[]): LeadRow[] {
    const withVal = list.map(l => ({ l, val: b2bQuoteMap[l.id]?.total_amount ?? l.monthly_budget ?? 0 }))
    if (sort === 'ltv_asc') return withVal.sort((a, b) => a.val - b.val).map(x => x.l)
    if (sort === 'newest')  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (sort === 'oldest')  return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
    return withVal.sort((a, b) => b.val - a.val).map(x => x.l)
  }

  // ── 데이터 분류 ──

  // type 필드 기준으로 개인/법인 분리
  const individualCustomers = sortCustomers((customers ?? []).filter(c => c.type !== 'recurring'))
  const companyCustomers = sortCustomers((customers ?? []).filter(c => c.type === 'recurring'))

  const activeLeads = sortLeads(
    (leads ?? []).filter(l => l.customer_type === 'company' && l.status !== 'archived' && !registeredLeadIds.has(l.id))
  )
  const archivedLeads = (leads ?? []).filter(l => l.customer_type === 'company' && l.status === 'archived')

  const totalLtv = (completedBookings ?? []).reduce((s, b) => s + (b.final_price ?? 0), 0)
  const monthlyRecurring = (contracts ?? []).filter(c => c.status === 'active').reduce((s, c) => s + c.contract_price, 0)

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">고객 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">개인 고객과 법인 거래처를 한 곳에서 관리해요</p>
        </div>
        <AddClientForm />
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">개인·일반 고객</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-blue-600">
            {individualCustomers.length}<span className="text-sm font-normal text-muted-foreground ml-0.5">명</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">누적 {totalLtv > 0 ? `${Math.round(totalLtv / 10000)}만원` : '—'}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">정기계약·법인 고객</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-violet-600">
            {activeLeads.length}<span className="text-sm font-normal text-muted-foreground ml-0.5">곳</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">계약 중인 고객 {companyCustomers.length}곳</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">월 정기 매출</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-emerald-600">
            {monthlyRecurring > 0 ? monthlyRecurring.toLocaleString('ko-KR') : '—'}
            {monthlyRecurring > 0 && <span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>}
          </p>
          {monthlyRecurring > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" /> 활성 계약 기준
            </p>
          )}
        </div>
      </div>

      {/* 탭 + 정렬 */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={buildHref({ type: tab.key, sort, show_archived: showArchived ? '1' : undefined })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto shrink-0">
          {SORT_OPTIONS.map((opt) => (
            <Link
              key={opt.key}
              href={buildHref({ type: activeTab, sort: opt.key, show_archived: showArchived ? '1' : undefined })}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                sort === opt.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── 개인·일반 고객 ── */}
      {(activeTab === 'all' || activeTab === 'individual') && (
        <section className="space-y-2">
          {activeTab === 'all' && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-blue-600">개인·일반 고객</h2>
              <span className="text-xs text-muted-foreground">({individualCustomers.length}명)</span>
            </div>
          )}

          {individualCustomers.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">아직 개인 고객이 없어요</p>
              <p className="text-xs text-muted-foreground">일반 예약 메뉴에서 견적을 보내면 자동으로 등록돼요</p>
            </div>
          ) : (
            individualCustomers.map((customer) => {
              const booking = customer.phone ? bookingMap[customer.phone] : undefined
              const customerContracts = contractMap[customer.id] ?? []
              const activeContract = customerContracts.find((c) => c.status === 'active') ?? null
              const hasAnyContract = customerContracts.length > 0
              const ltv = booking?.ltv ?? 0
              const bookingCount = booking?.count ?? 0
              const lastVisitDate = booking?.lastDate ?? null
              const statusKey = activeContract ? 'contract' : bookingCount >= 2 ? 'repeat' : bookingCount === 1 ? 'first' : 'registered'
              const statusMeta = CUSTOMER_STATUS[statusKey]!

              return (
                <div key={`customer-${customer.id}`} className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-sky-100 text-sky-700">개인</span>
                        <Link href={`/dashboard/clients/${customer.id}`} className="font-semibold hover:text-primary hover:underline transition-colors">
                          {customer.name}
                        </Link>
                        {customer.category && (
                          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{customer.category}</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusMeta.className}`}>{statusMeta.label}</span>
                      </div>
                      <div className="mt-1.5 space-y-0.5">
                        {customer.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />{customer.phone}
                          </p>
                        )}
                        {customer.address && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />{customer.address}
                          </p>
                        )}
                        {lastVisitDate && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0" />
                            마지막 방문 {new Date(lastVisitDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                            {bookingCount > 1 && ` · 총 ${bookingCount}회`}
                          </p>
                        )}
                      </div>
                      {activeContract && (
                        <div className="mt-2 pt-2 border-t flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            {activeContract.service_type} · {formatFrequency(activeContract.frequency)}
                          </p>
                          <ContractStatusSelect contractId={activeContract.id} currentStatus={activeContract.status} />
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <div className="text-right">
                        {ltv > 0 && <p className="text-base font-bold tabular-nums">{ltv.toLocaleString('ko-KR')}원</p>}
                        {activeContract && (
                          <p className="text-xs text-emerald-600 font-medium tabular-nums">
                            {activeContract.contract_price.toLocaleString('ko-KR')}원/월
                          </p>
                        )}
                        {ltv === 0 && !activeContract && <p className="text-xs text-muted-foreground">실적 없음</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Link href={`/dashboard/clients/${customer.id}`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:border-primary/30">
                          이력<ChevronRight className="h-3 w-3" />
                        </Link>
                        {customer.phone && <EditCustomerButton customer={{ ...customer, phone: customer.phone }} />}
                        <DeleteCustomerButton customerId={customer.id} customerName={customer.name} hasContract={hasAnyContract} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </section>
      )}

      {/* ── 정기계약·법인 고객 ── */}
      {(activeTab === 'all' || activeTab === 'company') && (
        <section className="space-y-2">
          {activeTab === 'all' && (
            <div className="flex items-center gap-2 mt-2">
              <Building2 className="h-4 w-4 text-violet-600" />
              <h2 className="text-sm font-semibold text-violet-600">정기계약·법인 고객</h2>
              <span className="text-xs text-muted-foreground">({activeLeads.length}곳 영업 중)</span>
            </div>
          )}

          {activeLeads.length === 0 && convertedCustomers.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">영업 중인 법인 거래처가 없어요</p>
              <Link href="/dashboard/pipeline" className="inline-block text-xs text-primary underline">
                거래처 추가하기 →
              </Link>
            </div>
          ) : (
            activeLeads.map((lead) => {
              const stage = PIPELINE_STAGE[lead.status] ?? PIPELINE_STAGE['new']!
              const b2bQuote = b2bQuoteMap[lead.id] ?? null
              const isOverdue = Boolean(
                lead.next_follow_up_date &&
                lead.next_follow_up_date < today &&
                lead.status !== 'contracted' &&
                lead.status !== 'rejected'
              )

              return (
                <div key={`lead-${lead.id}`} className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-violet-100 text-violet-700">법인</span>
                        <Link href={`/dashboard/pipeline/${lead.id}`} className="font-semibold hover:text-primary hover:underline transition-colors">
                          {lead.company_name}
                        </Link>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.color}`}>{stage.text}</span>
                        {isOverdue && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">연락 지연</span>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-0.5">
                        {lead.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />{lead.phone}
                          </p>
                        )}
                        {lead.address && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />{lead.address}
                          </p>
                        )}
                        {lead.next_follow_up_date && (
                          <p className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-amber-600'}`}>
                            <Calendar className="h-3 w-3 shrink-0" />
                            다음 연락: {new Date(lead.next_follow_up_date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                            {isOverdue && ' (지났어요)'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {b2bQuote ? (
                        <div className="text-right">
                          <p className="text-base font-bold tabular-nums">{b2bQuote.total_amount.toLocaleString('ko-KR')}원</p>
                          {b2bQuote.frequency && <p className="text-xs text-muted-foreground">{formatFrequency(b2bQuote.frequency)}</p>}
                        </div>
                      ) : lead.monthly_budget ? (
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums text-muted-foreground">~{lead.monthly_budget.toLocaleString('ko-KR')}원/월</p>
                          <p className="text-[10px] text-muted-foreground">예상</p>
                        </div>
                      ) : null}
                      <Link href={`/dashboard/pipeline/${lead.id}`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:border-primary/30">
                        영업 관리<ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {/* 계약 전환된 법인 고객 */}
          {convertedCustomers.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground px-1">계약 고객으로 전환됨</p>
              {convertedCustomers.map((customer) => {
                const customerContracts = contractMap[customer.id] ?? []
                const activeContract = customerContracts.find((c) => c.status === 'active') ?? null
                return (
                  <div key={`converted-${customer.id}`} className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 hover:border-emerald-300 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700">계약 고객</span>
                          <Link href={`/dashboard/clients/${customer.id}`} className="font-semibold hover:text-primary hover:underline">
                            {customer.name}
                          </Link>
                        </div>
                        {activeContract && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {activeContract.service_type} · {formatFrequency(activeContract.frequency)}
                            <span className="text-emerald-600 font-medium ml-2">{activeContract.contract_price.toLocaleString('ko-KR')}원/월</span>
                          </p>
                        )}
                      </div>
                      <Link href={`/dashboard/clients/${customer.id}`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-emerald-200 hover:border-emerald-400">
                        이력<ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 보관된 거래처 토글 */}
          {archivedLeads.length > 0 && (
            <div className="mt-4">
              {!showArchived ? (
                <Link
                  href={buildHref({ type: activeTab, sort, show_archived: '1' })}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Archive className="h-3.5 w-3.5" />
                  보관된 거래처 {archivedLeads.length}곳 보기
                </Link>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">보관된 거래처 ({archivedLeads.length}곳)</span>
                    </div>
                    <Link href={buildHref({ type: activeTab, sort })} className="text-xs text-muted-foreground hover:text-foreground underline">
                      숨기기
                    </Link>
                  </div>
                  {archivedLeads.map((lead) => (
                    <div key={`archived-${lead.id}`} className="bg-muted/30 rounded-xl border border-dashed border-border p-4 opacity-70">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500">보관됨</span>
                            <p className="font-medium text-muted-foreground">{lead.company_name}</p>
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {lead.phone && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />{lead.phone}
                              </p>
                            )}
                            {lead.notes && <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{lead.notes}</p>}
                          </div>
                        </div>
                        <Link href={`/dashboard/pipeline/${lead.id}`} className="text-xs text-primary hover:underline shrink-0 whitespace-nowrap">
                          다시 영업하기 →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
