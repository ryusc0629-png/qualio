import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddLeadForm } from '@/components/dashboard/add-lead-form'
import { LeadStatusSelect } from '@/components/dashboard/lead-status-select'
import { RegisterFromLeadButton } from '@/components/dashboard/register-from-lead-button'

const STATUS_META: Record<string, { label: string; className: string }> = {
  new:        { label: '신규',    className: 'bg-gray-100 text-gray-700' },
  contacted:  { label: '1차방문', className: 'bg-blue-100 text-blue-700' },
  follow_up:  { label: '팔로업',  className: 'bg-yellow-100 text-yellow-700' },
  quoted:     { label: '견적중',  className: 'bg-purple-100 text-purple-700' },
  contracted: { label: '계약완료', className: 'bg-green-100 text-green-700' },
  rejected:   { label: '거절',    className: 'bg-red-100 text-red-600' },
}

export default async function CrmPage() {
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
    { data: registeredLeads },
  ] = await Promise.all([
    db.from('leads')
      .select('id, company_name, contact_name, phone, address, category, status, next_follow_up_date, notes, created_at')
      .eq('business_id', profile.business_id)
      .order('created_at', { ascending: false }),

    // 이미 고객으로 등록된 lead_id 목록
    db.from('customers')
      .select('lead_id')
      .eq('business_id', profile.business_id)
      .not('lead_id', 'is', null),
  ])

  const registeredLeadIds = new Set((registeredLeads ?? []).map((c) => c.lead_id))

  const today = new Date().toISOString().slice(0, 10)

  // 상태별 건수
  const counts = (leads ?? []).reduce<Record<string, number>>((acc, lead) => {
    acc[lead.status] = (acc[lead.status] ?? 0) + 1
    return acc
  }, {})

  const summaryItems = [
    { status: 'new',        label: '신규',    color: 'text-gray-600',  bg: 'bg-gray-50' },
    { status: 'contacted',  label: '1차방문', color: 'text-blue-600',  bg: 'bg-blue-50' },
    { status: 'follow_up',  label: '팔로업',  color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { status: 'contracted', label: '계약완료', color: 'text-green-600', bg: 'bg-green-50' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">영업 CRM</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            방문한 잠재고객을 기록하고 팔로업을 관리하세요
          </p>
        </div>
        <AddLeadForm />
      </div>

      {/* 상태 요약 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryItems.map((item) => (
          <div key={item.status} className={`rounded-lg border p-4 ${item.bg}`}>
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={`text-2xl font-bold mt-1 ${item.color}`}>
              {counts[item.status] ?? 0}
              <span className="text-sm font-normal ml-1">건</span>
            </p>
          </div>
        ))}
      </div>

      {/* 안내 배너: 계약완료 → 고객 등록 유도 */}
      {(counts['contracted'] ?? 0) > 0 && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          💡 <strong>계약완료</strong> 업체는 오른쪽 <strong>"고객 등록"</strong> 버튼을 눌러 고객으로 전환하세요. 정기계약 금액도 함께 입력하면 매출이 자동 집계됩니다.
        </div>
      )}

      {/* 리드 목록 */}
      {!leads || leads.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">아직 등록된 잠재고객이 없습니다</p>
          <p className="text-xs text-muted-foreground mt-1">
            오늘 방문한 업체를 기록해보세요
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">업체명</th>
                <th className="text-left px-4 py-3 font-medium">업종</th>
                <th className="text-left px-4 py-3 font-medium">담당자</th>
                <th className="text-left px-4 py-3 font-medium">연락처</th>
                <th className="text-left px-4 py-3 font-medium">다음 방문일</th>
                <th className="text-center px-4 py-3 font-medium">상태</th>
                <th className="text-left px-4 py-3 font-medium">메모</th>
                <th className="text-center px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const isOverdue =
                  lead.next_follow_up_date &&
                  lead.next_follow_up_date < today &&
                  lead.status !== 'contracted' &&
                  lead.status !== 'rejected'

                const isContracted = lead.status === 'contracted'
                const alreadyRegistered = registeredLeadIds.has(lead.id)

                return (
                  <tr key={lead.id} className={`border-b last:border-0 hover:bg-muted/30 ${isContracted ? 'bg-green-50/30' : ''}`}>
                    <td className="px-4 py-3 font-medium">{lead.company_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.category ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.contact_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.phone ?? '—'}</td>
                    <td className={`px-4 py-3 font-medium ${isOverdue ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {lead.next_follow_up_date
                        ? new Date(lead.next_follow_up_date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                        : '—'}
                      {isOverdue && <span className="ml-1 text-xs">⚠</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <LeadStatusSelect leadId={lead.id} currentStatus={lead.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">
                      {lead.notes ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isContracted && (
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
