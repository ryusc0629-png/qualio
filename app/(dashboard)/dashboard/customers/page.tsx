import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddCustomerForm } from '@/components/dashboard/add-customer-form'

const TYPE_META: Record<string, { label: string; className: string }> = {
  recurring: { label: '정기 고객', className: 'bg-blue-100 text-blue-700' },
  one_time:  { label: '일회성',   className: 'bg-gray-100 text-gray-600' },
}

const CATEGORY_LIST = ['카페', '병원', '학원', '오피스', '상가', '식당', '헬스장', '기타']

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type: filterType } = await searchParams

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

  // 고객 목록 조회 (계약 정보 포함)
  const { data: customers } = await db
    .from('customers')
    .select('id, name, phone, address, category, type, notes, created_at')
    .eq('business_id', profile.business_id)
    .order('created_at', { ascending: false })

  // 활성 계약이 있는 고객 ID 목록
  const { data: activeContracts } = await db
    .from('contracts')
    .select('customer_id, contract_price')
    .eq('business_id', profile.business_id)
    .eq('status', 'active')

  const contractMap = (activeContracts ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.customer_id] = (acc[c.customer_id] ?? 0) + c.contract_price
    return acc
  }, {})

  const filtered = (customers ?? []).filter((c) => {
    if (filterType === 'recurring') return c.type === 'recurring'
    if (filterType === 'one_time') return c.type === 'one_time'
    return true
  })

  const totalCount = customers?.length ?? 0
  const recurringCount = customers?.filter((c) => c.type === 'recurring').length ?? 0
  const oneTimeCount = customers?.filter((c) => c.type === 'one_time').length ?? 0

  const tabs = [
    { key: undefined, label: `전체 (${totalCount})`, href: '/dashboard/customers' },
    { key: 'recurring', label: `정기 고객 (${recurringCount})`, href: '/dashboard/customers?type=recurring' },
    { key: 'one_time', label: `일회성 (${oneTimeCount})`, href: '/dashboard/customers?type=one_time' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">고객 관리</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            정기·일회성 고객을 통합 관리하세요
          </p>
        </div>
        <AddCustomerForm />
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => {
          const isActive = (filterType ?? undefined) === tab.key
          return (
            <a
              key={tab.label}
              href={tab.href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </a>
          )
        })}
      </div>

      {/* 고객 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">등록된 고객이 없습니다</p>
          <p className="text-xs text-muted-foreground mt-1">
            CRM에서 계약된 잠재고객을 등록하거나 직접 추가하세요
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">고객명</th>
                <th className="text-left px-4 py-3 font-medium">업종</th>
                <th className="text-left px-4 py-3 font-medium">연락처</th>
                <th className="text-center px-4 py-3 font-medium">유형</th>
                <th className="text-right px-4 py-3 font-medium">월 계약금액</th>
                <th className="text-left px-4 py-3 font-medium">주소</th>
                <th className="text-left px-4 py-3 font-medium">등록일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => {
                const meta = TYPE_META[customer.type] ?? TYPE_META['one_time']
                const monthlyPrice = contractMap[customer.id]

                return (
                  <tr key={customer.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{customer.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{customer.category ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{customer.phone}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {monthlyPrice
                        ? `${monthlyPrice.toLocaleString('ko-KR')}원`
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">
                      {customer.address ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(customer.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
