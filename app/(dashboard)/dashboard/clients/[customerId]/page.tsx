import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Calendar, Receipt, ChevronRight, FileText, User, Star, ShieldAlert, AlertTriangle, CheckCircle2, ClipboardList, Repeat, PhoneCall, StickyNote, Mic } from 'lucide-react'
import { formatFrequency } from '@/lib/utils/frequency'
import { EditCustomerButton } from '@/components/dashboard/edit-customer-button'
import { CustomerOnMyWayToggle } from '@/components/dashboard/customer-on-my-way-toggle'
import { ContactActions } from '@/components/dashboard/contact-actions'
import { AddClaimForm } from '@/components/dashboard/add-claim-form'
import { AddBookingButton } from '@/components/dashboard/add-booking-button'
import { MonthlyReportShare } from '@/components/dashboard/monthly-report-share'
import { ClaimActions } from '@/components/dashboard/claim-actions'
import { ClaimAssignee } from '@/components/dashboard/claim-assignee'
import { B2bQuoteList } from '@/components/dashboard/b2b-quote-list'
import { DeleteActivityButton } from '@/components/dashboard/delete-activity-button'
import { contractAccruedRevenue, type ContractLike } from '@/lib/utils/ltv'
import { getClaimBookingLabels } from '@/lib/utils/claim-booking'

interface Props {
  params: Promise<{ customerId: string }>
}

interface CustomerClaimRow {
  id: string
  title: string
  content: string | null
  is_urgent: boolean
  status: string
  resolution: string | null
  created_at: string
  resolved_at: string | null
  booking_id: string | null
  assigned_worker_id: string | null
}

const fmtClaimDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })

const STATUS_META: Record<string, { label: string; className: string }> = {
  confirmed:   { label: '예약 확정',  className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: '진행중',    className: 'bg-amber-100 text-amber-700' },
  completed:   { label: '완료',      className: 'bg-emerald-100 text-emerald-700' },
  no_show:     { label: '노쇼',      className: 'bg-red-100 text-red-600' },
  cancelled:   { label: '취소',      className: 'bg-gray-100 text-gray-500' },
}

// 계약 상태 배지
const CONTRACT_STATUS: Record<string, { label: string; className: string }> = {
  active:     { label: '진행중', className: 'bg-emerald-100 text-emerald-700' },
  paused:     { label: '중단',  className: 'bg-yellow-100 text-yellow-700' },
  terminated: { label: '해지',  className: 'bg-gray-100 text-gray-500' },
}

// 영업 기록(잠재고객 시절) 타입별 라벨·아이콘 — 파이프라인 상세와 동일 규칙
const ACTIVITY_CONFIG: Record<string, { text: string; icon: typeof PhoneCall; color: string }> = {
  call:    { text: '전화',     icon: PhoneCall, color: 'bg-blue-100 text-blue-700' },
  visit:   { text: '방문',     icon: User,      color: 'bg-indigo-100 text-indigo-700' },
  quote:   { text: '견적 발송', icon: FileText,  color: 'bg-amber-100 text-amber-700' },
  note:    { text: '메모',     icon: StickyNote,color: 'bg-gray-100 text-gray-700' },
  meeting: { text: '미팅',     icon: Mic,       color: 'bg-rose-100 text-rose-700' },
}

export default async function CustomerDetailPage({ params }: Props) {
  const { customerId } = await params

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

  const { data: customer } = await db
    .from('customers')
    .select('id, name, phone, address, category, type, notes, lead_id, created_at')
    .eq('id', customerId)
    .eq('business_id', profile.business_id)
    .maybeSingle()

  if (!customer) notFound()

  // 기사 출발 알림 수신 설정 (새 컬럼 — 타입 미반영이라 단언, 기본 켜짐)
  const { data: notifyRow } = await db
    .from('customers' as never)
    .select('notify_on_my_way' as never)
    .eq('id' as never, customerId)
    .maybeSingle() as { data: { notify_on_my_way: boolean | null } | null }
  const onMyWayOn = notifyRow?.notify_on_my_way !== false

  type BookingWithWorker = {
    id: string
    scheduled_at: string
    final_price: number | null
    status: string
    memo: string | null
    cancellation_reason: string | null
    worker_id?: string | null
    contract_id?: string | null
    quotes: { cleaning_type: string | null; space_size: number | null } | null
  }

  // 이 고객의 모든 예약 이력 조회 — customer_id(FK) 또는 전화번호로 연결된 것 모두.
  // (정기계약 자동생성 방문은 customer_id로 연결되므로 전화번호만으론 누락됨 → 두 키를 함께 조회)
  // (취소 건도 포함 — 이력에 '취소'로 표시. 매출·완료 집계엔 미포함. 완전 삭제만 제외.)
  const bookingOrFilter = customer.phone
    ? `customer_id.eq.${customerId},customer_phone.eq.${customer.phone}`
    : `customer_id.eq.${customerId}`
  const { data: bookings } = await db
    .from('bookings')
    .select('id, scheduled_at, final_price, status, memo, cancellation_reason, worker_id, contract_id, quotes!quote_id(cleaning_type, space_size)' as never)
    .eq('business_id', profile.business_id)
    .or(bookingOrFilter as never)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: false }) as unknown as { data: BookingWithWorker[] | null }

  const bookingList = (bookings ?? []) as BookingWithWorker[]

  // 담당자 조회
  const workerIds = [...new Set(bookingList.map((b) => b.worker_id).filter(Boolean))] as string[]
  const workerMap = new Map<string, string>()
  if (workerIds.length > 0) {
    const { data: workers } = await db
      .from('workers' as never)
      .select('id, name' as never)
      .in('id' as never, workerIds) as unknown as { data: { id: string; name: string }[] | null }
    for (const w of workers ?? []) {
      workerMap.set(w.id, w.name)
    }
  }

  // 완료된 예약의 보고서 조회
  const completedIds = bookingList.filter(b => b.status === 'completed').map(b => b.id)
  const reportMap = new Map<string, string>()
  if (completedIds.length > 0) {
    const { data: reports } = await db
      .from('reports' as never)
      .select('id, booking_id' as never)
      .in('booking_id' as never, completedIds) as unknown as { data: { id: string; booking_id: string }[] | null }
    for (const r of reports ?? []) {
      reportMap.set(r.booking_id, r.id)
    }
  }

  // 리뷰 작성 이력 조회
  let reviewCount = 0
  if (customer.phone) {
    const { count } = await db
      .from('review_claims' as never)
      .select('id' as never, { count: 'exact', head: true })
      .eq('business_id' as never, profile.business_id)
      .eq('customer_phone' as never, customer.phone)
      .not('claimed_at' as never, 'is', null) as unknown as { count: number | null }
    reviewCount = count ?? 0
  }

  // 이 고객의 계약 조회 — 카드 표시 + LTV 계약 누적 매출 계산
  const { data: customerContracts } = await db
    .from('contracts')
    .select('id, service_type, frequency, contract_price, start_date, end_date, status')
    .eq('business_id', profile.business_id)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  // 이 고객의 B2B 견적서/시방서 — 한 거래처에 여러 장 가능(재계약·추가 견적). 만든 순서로 전부 조회
  interface B2bQuoteExisting {
    id: string
    public_token: string | null
    title: string | null
    quote_number: string | null
    valid_until: string | null
    items: { name: string; unit: string; qty: number; unit_price: number }[]
    total_amount: number
    tax_included: boolean
    conditions: string | null
    site_name: string | null
    site_address: string | null
    site_area: string | null
    frequency: string | null
    worker_count: number | null
    spec_content: string | null
    job_type: string | null
  }
  const { data: b2bQuotesRaw } = await db
    .from('b2b_quotes')
    .select('*')
    .eq('customer_id' as never, customerId)
    .eq('business_id', profile.business_id)
    .order('created_at' as never, { ascending: true }) as unknown as { data: B2bQuoteExisting[] | null }
  const b2bQuotes = (b2bQuotesRaw ?? []).map((q) => ({
    ...q,
    items: Array.isArray(q.items) ? q.items : [],
  }))

  // 잠재고객(리드) 시절 영업 기록 — 전환된 고객이면 상담·통화·견적 이력을 이어서 보여줌
  type LeadActivity = { id: string; type: string; content: string | null; activity_at: string }
  const { data: leadActivities } = customer.lead_id
    ? await db
        .from('lead_activities' as never)
        .select('id, type, content, activity_at' as never)
        .eq('lead_id' as never, customer.lead_id)
        .order('activity_at' as never, { ascending: false }) as unknown as { data: LeadActivity[] | null }
    : { data: null }
  const salesActivities = leadActivities ?? []

  // 이 고객의 클레임 조회 (전화번호로 연결 — 예약/리뷰와 동일 방식)
  const { data: claimsData } = customer.phone
    ? await db
        .from('claims' as never)
        .select('id, title, content, is_urgent, status, resolution, created_at, resolved_at, booking_id, assigned_worker_id' as never)
        .eq('business_id' as never, profile.business_id)
        .eq('customer_phone' as never, customer.phone)
        .order('is_urgent' as never, { ascending: false })
        .order('created_at' as never, { ascending: false }) as unknown as { data: CustomerClaimRow[] | null }
    : { data: null }

  const customerClaims = claimsData ?? []
  const openClaimCount = customerClaims.filter((c) => c.status !== 'resolved').length
  const claimBookingLabels = await getClaimBookingLabels(db, profile.business_id, customerClaims.map((c) => c.booking_id))

  // 담당자 배정용 활성 직원 (클레임이 있을 때만 조회)
  const { data: claimWorkerRows } = customerClaims.length > 0
    ? await db
        .from('workers' as never)
        .select('id, name' as never)
        .eq('business_id' as never, profile.business_id)
        .eq('is_active' as never, true)
        .order('name' as never) as unknown as { data: { id: string; name: string }[] | null }
    : { data: null }
  const claimWorkers = claimWorkerRows ?? []

  const oneOffTotal = bookingList
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + (b.final_price ?? 0), 0)

  // 통합 LTV = 일회성 완료 예약 합계 + 계약 누적(경과 개월 × 월계약금)
  const contractTotal = contractAccruedRevenue((customerContracts ?? []) as ContractLike[])
  const totalLTV = oneOffTotal + contractTotal

  const completedCount = bookingList.filter((b) => b.status === 'completed').length

  // 계약별 방문 요약 (다음 예정 방문 · 완료·예정 횟수) — bookingList를 contract_id로 그룹
  const nowIso = new Date().toISOString()
  const contractVisits = new Map<string, { next: string | null; completed: number; upcoming: number }>()
  for (const b of bookingList) {
    if (!b.contract_id) continue
    const cur = contractVisits.get(b.contract_id) ?? { next: null, completed: 0, upcoming: 0 }
    if (b.status === 'completed') cur.completed++
    if (['confirmed', 'in_progress'].includes(b.status) && b.scheduled_at > nowIso) {
      cur.upcoming++
      if (cur.next === null || b.scheduled_at < cur.next) cur.next = b.scheduled_at
    }
    contractVisits.set(b.contract_id, cur)
  }
  const contractList = (customerContracts ?? []) as Array<
    ContractLike & { id: string; service_type: string | null; frequency: string }
  >

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* 뒤로 가기 */}
      <Link
        href="/dashboard/clients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        고객 목록
      </Link>

      {/* 고객 기본 정보 */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{customer.name}</h1>
            {customer.category && (
              <span className="mt-1 inline-block text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                {customer.category}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              customer.type === 'recurring'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {customer.type === 'recurring' ? '정기 고객' : '일회성'}
            </span>
            {reviewCount > 0 && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700 flex items-center gap-0.5">
                <Star className="h-3 w-3" />
                리뷰 {reviewCount}회
              </span>
            )}
            {customer.phone && (
              <EditCustomerButton customer={{ ...customer, phone: customer.phone, notes: customer.notes }} />
            )}
          </div>
        </div>

        {/* 전화·문자·길찾기 바로가기 (탭 한 번으로 전화/지도) */}
        <ContactActions phone={customer.phone} address={customer.address} />

        {/* 기사 출발 알림 수신 설정 (고객별 on/off) */}
        {customer.phone && (
          <CustomerOnMyWayToggle customerId={customer.id} initialOn={onMyWayOn} />
        )}

        {customer.notes && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">
            {customer.notes}
          </p>
        )}
      </div>

      {/* 실적 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">누적 매출</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">
            {totalLTV > 0 ? totalLTV.toLocaleString('ko-KR') : '—'}
            {totalLTV > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>
            )}
          </p>
          {contractTotal > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              일회성 {Math.round(oneOffTotal / 10000)}만 + 계약 {Math.round(contractTotal / 10000)}만
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">완료 방문</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">
            {completedCount}
            <span className="text-sm font-normal text-muted-foreground ml-0.5">회</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">리뷰 작성</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-amber-600">
            {reviewCount}
            <span className="text-sm font-normal text-muted-foreground ml-0.5">회</span>
          </p>
        </div>
      </div>

      {/* 견적서·시방서 — 계약 중 거래처에도 견적서/시방서를 만들고 공개 링크로 발송 (재계약·추가 견적) */}
      <B2bQuoteList
        quotes={b2bQuotes}
        customerId={customer.id}
        clientName={customer.name}
      />

      {/* 정기계약 — 계약을 고객 허브에 직접 표시 (주기·월금액·다음 방문·완료/예정 횟수) */}
      {contractList.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Repeat className="h-4 w-4 text-emerald-600" />
            정기계약
          </h2>
          <div className="space-y-2">
            {contractList.map((contract) => {
              const meta = CONTRACT_STATUS[contract.status] ?? { label: contract.status, className: 'bg-gray-100 text-gray-500' }
              const visits = contractVisits.get(contract.id)
              return (
                <div key={contract.id} className="bg-white rounded-xl border border-emerald-100 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{contract.service_type ?? '정기 청소'}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.className}`}>{meta.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{formatFrequency(contract.frequency)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold tabular-nums text-emerald-700">{contract.contract_price.toLocaleString('ko-KR')}<span className="text-xs font-normal text-muted-foreground ml-0.5">원/월</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground border-t border-border pt-2">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {visits?.next
                        ? `다음 방문 ${new Date(visits.next).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })}`
                        : contract.status === 'active' ? '예정된 방문 없음' : '—'}
                    </span>
                    <span>완료 {visits?.completed ?? 0}회</span>
                    {(visits?.upcoming ?? 0) > 0 && <span>예정 {visits!.upcoming}회</span>}
                    <span className="text-muted-foreground/70">
                      {new Date(contract.start_date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })} 시작
                      {contract.end_date ? ` · ${new Date(contract.end_date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })} 종료` : ' · 무기한'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 거래처 월간 작업 리포트 — 이번 달 방문·작업내역·사진을 정리해 법인 담당자에게 전달 */}
          <MonthlyReportShare
            businessId={profile.business_id}
            customerId={customer.id}
            customerName={customer.name}
          />
        </div>
      )}

      {/* 클레임 — 이 고객으로 바로 등록(같은 모달 재사용) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-rose-500" />
            클레임
            {openClaimCount > 0 && (
              <span className="text-xs font-semibold text-rose-600">{openClaimCount}건 미해결</span>
            )}
          </h2>
          <AddClaimForm
            presetCustomer={{ id: customer.id, name: customer.name, phone: customer.phone }}
            triggerLabel="클레임 등록"
            triggerClassName="h-9 px-3 text-sm"
          />
        </div>

        {customerClaims.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">이 고객의 클레임이 없어요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {customerClaims.map((claim) => {
              const resolved = claim.status === 'resolved'
              return (
                <article
                  key={claim.id}
                  className={`rounded-xl border p-4 space-y-2 ${resolved ? 'bg-muted/30 border-border' : 'bg-white border-border'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!resolved && claim.is_urgent && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3" />
                            긴급
                          </span>
                        )}
                        <p className={`font-semibold ${resolved ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''}`}>
                          {claim.title}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground inline-flex items-center gap-1">
                      {resolved && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      {fmtClaimDate(resolved && claim.resolved_at ? claim.resolved_at : claim.created_at)}
                    </span>
                  </div>
                  {claim.booking_id && claimBookingLabels.get(claim.booking_id) && (
                    <p className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1">
                      <ClipboardList className="h-3 w-3 shrink-0" />
                      관련 작업: {claimBookingLabels.get(claim.booking_id)}
                    </p>
                  )}
                  {claim.content && !resolved && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">
                      {claim.content}
                    </p>
                  )}
                  {claim.resolution && resolved && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">
                      해결: {claim.resolution}
                    </p>
                  )}
                  {!resolved && (
                    <ClaimAssignee claimId={claim.id} currentWorkerId={claim.assigned_worker_id} workers={claimWorkers} />
                  )}
                  <ClaimActions claimId={claim.id} status={claim.status} />
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* 서비스 이력 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">서비스 이력</h2>
          <AddBookingButton customer={{ name: customer.name, phone: customer.phone, address: customer.address }} />
        </div>

        {bookingList.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">아직 예약 이력이 없어요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bookingList.map((booking) => {
              const quote = booking.quotes as { cleaning_type: string | null; space_size: number | null } | null
              const serviceName = quote?.cleaning_type ?? booking.memo ?? '직접 예약'
              const spaceLabel = quote?.space_size ? ` · ${quote.space_size}평` : ''
              const statusMeta = STATUS_META[booking.status] ?? { label: booking.status, className: 'bg-gray-100 text-gray-600' }
              const isCancelled = booking.status === 'cancelled'
              const hasReport = reportMap.has(booking.id)
              const reportLink = hasReport ? `/dashboard/bookings/${booking.id}/report` : null
              const workerName = booking.worker_id ? workerMap.get(booking.worker_id) : null

              const CardWrapper = reportLink
                ? ({ children }: { children: React.ReactNode }) => (
                    <Link href={reportLink} className="block bg-white rounded-xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                      {children}
                    </Link>
                  )
                : ({ children }: { children: React.ReactNode }) => (
                    <div className={`rounded-xl border p-4 ${isCancelled ? 'bg-muted/30 border-dashed border-border' : 'bg-white border-border'}`}>
                      {children}
                    </div>
                  )

              return (
                <CardWrapper key={booking.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-medium ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>{serviceName}{spaceLabel}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {new Date(booking.scheduled_at).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                      {workerName && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" />
                          {workerName}
                        </p>
                      )}
                      {isCancelled && booking.cancellation_reason && (
                        <p className="text-xs text-muted-foreground mt-1">
                          취소 사유: <span className="text-foreground/80">{booking.cancellation_reason}</span>
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <p className={`font-bold tabular-nums flex items-center gap-1 text-sm ${isCancelled ? 'line-through text-muted-foreground font-medium' : ''}`}>
                        <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                        {(booking.final_price ?? 0).toLocaleString('ko-KR')}원
                      </p>
                      {hasReport && (
                        <span className="text-xs text-primary flex items-center gap-0.5">
                          <FileText className="h-3 w-3" />
                          보고서 보기
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </CardWrapper>
              )
            })}
          </div>
        )}
      </div>

      {/* 영업 기록 — 잠재고객(리드) 시절의 통화·미팅·견적 이력을 고객 허브에서 이어서 확인 */}
      {customer.lead_id && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">영업 기록</h2>
            <Link
              href={`/dashboard/pipeline/${customer.lead_id}`}
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              영업 상세<ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {salesActivities.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">이 고객으로 전환되기 전 영업 기록이 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {salesActivities.map((activity) => {
                const cfg = ACTIVITY_CONFIG[activity.type] ?? ACTIVITY_CONFIG.note!
                const Icon = cfg.icon
                return (
                  <div key={activity.id} className="bg-white rounded-xl border border-border p-4 flex items-start gap-3">
                    <span className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${cfg.color}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{cfg.text}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(activity.activity_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })}
                        </span>
                      </div>
                      {activity.content && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{activity.content}</p>
                      )}
                    </div>
                    <DeleteActivityButton activityId={activity.id} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
