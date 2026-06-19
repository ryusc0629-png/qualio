import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Calendar, Receipt, ChevronRight, FileText, User, Star, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { EditCustomerButton } from '@/components/dashboard/edit-customer-button'
import { ContactActions } from '@/components/dashboard/contact-actions'
import { AddClaimForm } from '@/components/dashboard/add-claim-form'
import { ClaimActions } from '@/components/dashboard/claim-actions'
import { contractAccruedRevenue, type ContractLike } from '@/lib/utils/ltv'

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
}

const fmtClaimDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })

const STATUS_META: Record<string, { label: string; className: string }> = {
  confirmed:   { label: '예약 확정',  className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: '진행중',    className: 'bg-amber-100 text-amber-700' },
  completed:   { label: '완료',      className: 'bg-emerald-100 text-emerald-700' },
  no_show:     { label: '노쇼',      className: 'bg-red-100 text-red-600' },
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
    .select('id, name, phone, address, category, type, notes, created_at')
    .eq('id', customerId)
    .eq('business_id', profile.business_id)
    .maybeSingle()

  if (!customer) notFound()

  // 전화번호 기준으로 해당 고객의 모든 예약 이력 조회
  const { data: bookings } = customer.phone
    ? await db
        .from('bookings')
        .select('id, scheduled_at, final_price, status, memo, quotes!quote_id(cleaning_type, space_size)')
        .eq('business_id', profile.business_id)
        .eq('customer_phone', customer.phone)
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .order('scheduled_at', { ascending: false })
    : { data: null }

  type BookingRow = typeof bookings extends (infer T)[] | null ? T : never
  type BookingWithWorker = BookingRow & { worker_id?: string | null }
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

  // 이 고객의 계약 조회 — LTV에 계약 누적 매출을 더하기 위해
  const { data: customerContracts } = await db
    .from('contracts')
    .select('contract_price, start_date, end_date, status')
    .eq('business_id', profile.business_id)
    .eq('customer_id', customerId)

  // 이 고객의 클레임 조회 (전화번호로 연결 — 예약/리뷰와 동일 방식)
  const { data: claimsData } = customer.phone
    ? await db
        .from('claims' as never)
        .select('id, title, content, is_urgent, status, resolution, created_at, resolved_at' as never)
        .eq('business_id' as never, profile.business_id)
        .eq('customer_phone' as never, customer.phone)
        .order('is_urgent' as never, { ascending: false })
        .order('created_at' as never, { ascending: false }) as unknown as { data: CustomerClaimRow[] | null }
    : { data: null }

  const customerClaims = claimsData ?? []
  const openClaimCount = customerClaims.filter((c) => c.status !== 'resolved').length

  const oneOffTotal = bookingList
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + (b.final_price ?? 0), 0)

  // 통합 LTV = 일회성 완료 예약 합계 + 계약 누적(경과 개월 × 월계약금)
  const contractTotal = contractAccruedRevenue((customerContracts ?? []) as ContractLike[])
  const totalLTV = oneOffTotal + contractTotal

  const completedCount = bookingList.filter((b) => b.status === 'completed').length

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
                  <ClaimActions claimId={claim.id} status={claim.status} />
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* 서비스 이력 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">서비스 이력</h2>

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
                    <div className="bg-white rounded-xl border border-border p-4">
                      {children}
                    </div>
                  )

              return (
                <CardWrapper key={booking.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{serviceName}{spaceLabel}</p>
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
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <p className="font-bold tabular-nums flex items-center gap-1 text-sm">
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

    </div>
  )
}
