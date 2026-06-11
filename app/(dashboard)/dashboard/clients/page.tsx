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
import { TrendingUp, Phone, MapPin, Calendar } from 'lucide-react'
import Link from 'next/link'

const LEAD_STATUS_META: Record<string, { label: string; className: string }> = {
  new:        { label: '신규',     className: 'bg-gray-100 text-gray-600' },
  contacted:  { label: '1차방문',  className: 'bg-blue-100 text-blue-700' },
  follow_up:  { label: '팔로업',   className: 'bg-yellow-100 text-yellow-700' },
  quoted:     { label: '견적중',   className: 'bg-purple-100 text-purple-700' },
  contracted: { label: '계약완료', className: 'bg-green-100 text-green-700' },
  rejected:   { label: '거절',     className: 'bg-red-100 text-red-600' },
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams

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

  const [
    { data: leads },
    { data: customers },
    { data: contracts },
    { data: registeredLeads },
  ] = await Promise.all([
    db.from('leads')
      .select('id, company_name, phone, address, category, status, next_follow_up_date, notes, created_at')
      .eq('business_id', profile.business_id)
      .order('created_at', { ascending: false }),

    db.from('customers')
      .select('id, name, phone, address, category, type, notes, created_at')
      .eq('business_id', profile.business_id)
      .order('created_at', { ascending: false }),

    db.from('contracts')
      .select('id, customer_id, service_type, frequency, contract_price, status')
      .eq('business_id', profile.business_id),

    db.from('customers')
      .select('lead_id')
      .eq('business_id', profile.business_id)
      .not('lead_id', 'is', null),
  ])

  type ContractRow = NonNullable<typeof contracts>[number]
  const contractByCustomer: Record<string, ContractRow[]> = {}
  for (const c of contracts ?? []) {
    if (!contractByCustomer[c.customer_id]) contractByCustomer[c.customer_id] = []
    contractByCustomer[c.customer_id]!.push(c)
  }

  const registeredLeadIds = new Set((registeredLeads ?? []).map((r) => r.lead_id))

  const today = new Date().toISOString().slice(0, 10)

  const allLeads = leads ?? []
  const allCustomers = customers ?? []

  const totalCount = allLeads.length + allCustomers.length
  const leadCount = allLeads.length
  const customerCount = allCustomers.length

  const monthlyRevenue = (contracts ?? [])
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + c.contract_price, 0)

  const tabs = [
    { key: undefined,    label: `전체 (${totalCount})`,     href: '/dashboard/clients' },
    { key: 'lead',       label: `잠재고객 (${leadCount})`,  href: '/dashboard/clients?tab=lead' },
    { key: 'active',     label: `활성 고객 (${customerCount})`, href: '/dashboard/clients?tab=active' },
  ]

  const showLeads    = !tab || tab === 'lead'
  const showCustomers = !tab || tab === 'active'

  const isEmpty = (tab === 'lead' && allLeads.length === 0) ||
                  (tab === 'active' && allCustomers.length === 0) ||
                  (!tab && totalCount === 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">클라이언트</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            잠재고객부터 활성 고객까지 한 곳에서 관리하세요
          </p>
        </div>
        <AddClientForm />
      </div>

      {/* 정기 매출 요약 */}
      {monthlyRevenue > 0 && (tab === 'active' || !tab) && (
        <div className="rounded-xl border bg-gradient-to-r from-green-50 to-emerald-50 p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-green-700" />
          </div>
          <div>
            <p className="text-sm text-green-700 font-medium">확정 정기 매출</p>
            <p className="text-2xl font-bold text-green-800">
              {monthlyRevenue.toLocaleString('ko-KR')}원
              <span className="text-sm font-normal text-green-600 ml-1">/ 월</span>
            </p>
          </div>
          <p className="ml-auto text-xs text-green-600 hidden sm:block">활성 계약 기준</p>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => {
          const isActive = (tab ?? undefined) === t.key
          return (
            <Link
              key={t.label}
              href={t.href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>

      {/* 빈 상태 */}
      {isEmpty && (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-3">
          <p className="text-muted-foreground">
            {tab === 'lead' ? '아직 등록된 잠재고객이 없어요' :
             tab === 'active' ? '아직 등록된 활성 고객이 없어요' :
             '아직 등록된 고객이 없어요'}
          </p>
          <p className="text-xs text-muted-foreground">오른쪽 위 "추가하기" 버튼을 눌러 첫 번째 고객을 추가해보세요</p>
        </div>
      )}

      {/* 활성 고객 목록 */}
      {showCustomers && allCustomers.length > 0 && (
        <div className="space-y-2">
          {!tab && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              활성 고객 ({customerCount})
            </p>
          )}
          {allCustomers.map((customer) => {
            const customerContracts = contractByCustomer[customer.id] ?? []
            const activeContract = customerContracts.find((c) => c.status === 'active')
            const isRecurring = customer.type === 'recurring'
            const hasAnyContract = customerContracts.length > 0

            return (
              <div
                key={customer.id}
                className={`rounded-xl border p-4 hover:border-primary/30 transition-colors ${
                  isRecurring ? 'border-l-4 border-l-blue-400' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{customer.name}</p>
                      {customer.category && (
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{customer.category}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isRecurring ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isRecurring ? '정기 고객' : '일회성'}
                      </span>
                    </div>

                    {customer.phone && (
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </p>
                    )}
                    {customer.address && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {customer.address}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1">
                      <EditCustomerButton customer={customer} />
                      <DeleteCustomerButton
                        customerId={customer.id}
                        customerName={customer.name}
                        hasContract={hasAnyContract}
                      />
                    </div>

                    {activeContract ? (
                      <div className="text-right">
                        <p className="text-lg font-bold tabular-nums">
                          {activeContract.contract_price.toLocaleString('ko-KR')}원
                          <span className="text-xs font-normal text-muted-foreground ml-1">/ 월</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activeContract.service_type} · {formatFrequency(activeContract.frequency)}
                        </p>
                        <div className="mt-1">
                          <ContractStatusSelect
                            contractId={activeContract.id}
                            currentStatus={activeContract.status}
                          />
                        </div>
                      </div>
                    ) : isRecurring ? (
                      <Link
                        href="/dashboard/contracts"
                        className="text-xs text-primary hover:underline"
                      >
                        + 계약 등록
                      </Link>
                    ) : null}
                  </div>
                </div>

                {!activeContract && customerContracts.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      {customerContracts[0]!.service_type} · {formatFrequency(customerContracts[0]!.frequency)} ·{' '}
                      <span className="text-red-500">
                        {customerContracts[0]!.status === 'terminated' ? '해지됨' : '중단됨'}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 잠재고객 목록 */}
      {showLeads && allLeads.length > 0 && (
        <div className="space-y-2">
          {!tab && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              잠재고객 ({leadCount})
            </p>
          )}
          {allLeads.map((lead) => {
            const isOverdue =
              lead.next_follow_up_date &&
              lead.next_follow_up_date < today &&
              lead.status !== 'contracted' &&
              lead.status !== 'rejected'

            const statusMeta = LEAD_STATUS_META[lead.status] ?? LEAD_STATUS_META['new']!
            const alreadyRegistered = registeredLeadIds.has(lead.id)

            return (
              <div
                key={lead.id}
                className={`rounded-xl border p-4 hover:border-primary/30 transition-colors ${
                  lead.status === 'contracted' ? 'bg-green-50/40' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{lead.company_name}</p>
                      {lead.category && (
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{lead.category}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    {lead.phone && (
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {lead.phone}
                      </p>
                    )}
                    {lead.address && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {lead.address}
                      </p>
                    )}
                    {lead.next_follow_up_date && (
                      <p className={`text-xs mt-1 flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                        <Calendar className="h-3 w-3" />
                        다음 연락:{' '}
                        {new Date(lead.next_follow_up_date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                        {isOverdue && ' ⚠ 지났어요'}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1">
                      <DeleteLeadButton leadId={lead.id} leadName={lead.company_name} />
                    </div>
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
                  </div>
                </div>

                {lead.notes && (
                  <p className="mt-2 pt-2 border-t text-xs text-muted-foreground line-clamp-2">
                    {lead.notes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
