import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddBookingForm } from '@/components/dashboard/add-booking-form'
import { ConfirmBookingButton } from '@/components/dashboard/confirm-booking-button'
import { ArchiveQuoteButton } from '@/components/dashboard/archive-quote-button'
import { BookingCardList } from '@/components/dashboard/booking-card-list'
import Link from 'next/link'
import { Phone, Calendar, Archive, MapPin } from 'lucide-react'

// ── 상수 ────────────────────────────────────────────────

const QUOTE_STATUS: Record<string, { text: string; className: string }> = {
  pending:   { text: '답변 대기', className: 'bg-amber-100 text-amber-800' },
  booked:    { text: '예약됨',   className: 'bg-green-100 text-green-800' },
  expired:   { text: '만료',     className: 'bg-gray-100 text-gray-500' },
  archived:  { text: '보관됨',   className: 'bg-slate-100 text-slate-500' },
  cancelled: { text: '취소',     className: 'bg-red-100 text-red-700' },
}

// ── 페이지 ────────────────────────────────────────────────

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab = tab === 'bookings' ? 'bookings' : tab === 'archived' ? 'archived' : 'quotes'

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
    { data: activeQuotes },
    { data: archivedQuotes },
    { data: bookings },
  ] = await Promise.all([
    // 활성 견적 — archived·booked 제외 (예약 확정된 견적은 예약 탭에서 관리)
    db.from('quotes')
      .select('id, cleaning_type, space_size, preferred_date, good_price, better_price, best_price, status, customer_name, customer_phone, created_at')
      .eq('business_id', businessId)
      .in('status', ['pending', 'expired', 'cancelled'])
      .order('created_at', { ascending: false }),

    // 보관함 — archived만
    db.from('quotes')
      .select('id, cleaning_type, space_size, preferred_date, good_price, better_price, best_price, status, customer_name, customer_phone, created_at')
      .eq('business_id', businessId)
      .eq('status', 'archived')
      .order('created_at', { ascending: false }),

    db.from('bookings')
      .select('id, customer_name, customer_phone, service_address, scheduled_at, selected_tier, final_price, status, memo, created_at, quotes!quote_id(cleaning_type, space_size)')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: false }),
  ])

  const pendingCount       = activeQuotes?.filter((q) => q.status === 'pending').length ?? 0
  const archivedCount      = archivedQuotes?.length ?? 0
  const activeBookingCount = bookings?.filter((b) => b.status === 'confirmed' || b.status === 'in_progress').length ?? 0

  const tabs = [
    { key: 'quotes',   label: '견적 요청', href: '/dashboard/work',               count: pendingCount },
    { key: 'bookings', label: '예약',      href: '/dashboard/work?tab=bookings',  count: activeBookingCount },
    { key: 'archived', label: '보관함',    href: '/dashboard/work?tab=archived',  count: archivedCount },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">업무</h1>
          <p className="text-sm text-muted-foreground mt-1">
            견적 요청 확인 → 예약 확정 순서로 처리해요
          </p>
        </div>
        {activeTab === 'bookings' && <AddBookingForm />}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* ── 견적 요청 탭 ── */}
      {activeTab === 'quotes' && (
        <>
          {!activeQuotes || activeQuotes.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center space-y-2">
              <p className="text-sm text-muted-foreground">아직 견적 요청이 없어요</p>
              <p className="text-xs text-muted-foreground">대시보드 홈에서 고객 링크를 공유해보세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeQuotes.map((quote) => {
                const status     = QUOTE_STATUS[quote.status] ?? { text: quote.status, className: 'bg-gray-100 text-gray-600' }
                const hasContact = Boolean(quote.customer_phone)
                const canArchive = quote.status === 'pending' || quote.status === 'expired'

                return (
                  <div
                    key={quote.id}
                    className={[
                      'bg-white rounded-xl border p-4 transition-colors',
                      quote.status === 'expired'
                        ? 'border-border opacity-60'
                        : 'border-border hover:border-primary/30',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">
                            {quote.cleaning_type ?? '서비스 미선택'}
                            {quote.space_size && (
                              <span className="ml-1 text-sm font-normal text-muted-foreground">
                                {quote.space_size}평
                              </span>
                            )}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                            {status.text}
                          </span>
                        </div>

                        <div className="mt-1.5 space-y-0.5">
                          {hasContact ? (
                            <p className="text-sm flex items-center gap-1">
                              <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                              {quote.customer_name && (
                                <span className="font-medium mr-0.5">{quote.customer_name}</span>
                              )}
                              <span className="text-muted-foreground">{quote.customer_phone}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">연락처 미입력</p>
                          )}
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0" />
                            {quote.preferred_date ? `희망일 ${quote.preferred_date}` : '희망일 미정'}
                            {' · '}
                            {new Date(quote.created_at).toLocaleDateString('ko-KR')} 요청
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right space-y-2">
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>기본 <span className="tabular-nums text-foreground font-semibold">{quote.good_price?.toLocaleString() ?? '—'}원</span></p>
                          <p>추천 <span className="tabular-nums text-foreground font-semibold">{quote.better_price?.toLocaleString() ?? '—'}원</span></p>
                          <p>프리미엄 <span className="tabular-nums text-foreground font-semibold">{quote.best_price?.toLocaleString() ?? '—'}원</span></p>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          {quote.status === 'pending' && (
                            <ConfirmBookingButton
                              quoteId={quote.id}
                              goodPrice={quote.good_price}
                              betterPrice={quote.better_price}
                              bestPrice={quote.best_price}
                              preferredDate={quote.preferred_date}
                            />
                          )}
                          {canArchive && (
                            <ArchiveQuoteButton quoteId={quote.id} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── 보관함 탭 ── */}
      {activeTab === 'archived' && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
            <Archive className="h-3.5 w-3.5 shrink-0" />
            <p>보관된 견적은 여기서 확인할 수 있어요. 고객 정보는 영구 보존됩니다.</p>
          </div>

          {!archivedQuotes || archivedQuotes.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center space-y-2">
              <p className="text-sm text-muted-foreground">보관된 견적이 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {archivedQuotes.map((quote) => {
                const hasContact = Boolean(quote.customer_phone)
                return (
                  <div
                    key={quote.id}
                    className="bg-white rounded-xl border border-border p-4 opacity-70"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-muted-foreground">
                            {quote.cleaning_type ?? '서비스 미선택'}
                            {quote.space_size && (
                              <span className="ml-1 text-sm font-normal">
                                {quote.space_size}평
                              </span>
                            )}
                          </p>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                            보관됨
                          </span>
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          {hasContact ? (
                            <p className="text-sm flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3 shrink-0" />
                              {quote.customer_name && <span className="font-medium mr-0.5">{quote.customer_name}</span>}
                              {quote.customer_phone}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">연락처 미입력</p>
                          )}
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0" />
                            {new Date(quote.created_at).toLocaleDateString('ko-KR')} 요청
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>기본 <span className="tabular-nums">{quote.good_price?.toLocaleString() ?? '—'}원</span></p>
                          <p>추천 <span className="tabular-nums">{quote.better_price?.toLocaleString() ?? '—'}원</span></p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── 예약 탭 ── */}
      {activeTab === 'bookings' && (
        <BookingCardList bookings={bookings ?? []} />
      )}

    </div>
  )
}
