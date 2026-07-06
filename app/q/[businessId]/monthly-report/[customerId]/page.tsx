import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CheckCircle2, Clock, Calendar, User, Phone, Sparkles } from 'lucide-react'
import { ReportPhotoSection } from '../../report/[reportId]/report-photos'

// ── 월 범위 계산 (KST 기준) ────────────────────────────────
// month는 'YYYY-MM'. 없으면 이번 달(KST). 시작~끝을 UTC ISO로 반환.
function monthRange(month: string | undefined): { key: string; label: string; startISO: string; endISO: string } {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const key =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth() + 1).padStart(2, '0')}`

  const [year, mon] = key.split('-').map(Number)
  // 해당 달 1일 00:00 KST ~ 다음 달 1일 00:00 KST (UTC로 −9시간)
  const startISO = new Date(Date.UTC(year!, mon! - 1, 1, 0, 0) - 9 * 60 * 60 * 1000).toISOString()
  const endISO = new Date(Date.UTC(year!, mon!, 1, 0, 0) - 9 * 60 * 60 * 1000).toISOString()
  return { key, label: `${year}년 ${mon}월`, startISO, endISO }
}

function formatVisitDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  })
}

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: '매주',
  biweekly: '격주',
  monthly: '매월',
}

interface PageProps {
  params: Promise<{ businessId: string; customerId: string }>
  searchParams: Promise<{ month?: string }>
}

export default async function MonthlyReportPage({ params, searchParams }: PageProps) {
  const { businessId, customerId } = await params
  const { month } = await searchParams
  const range = monthRange(month)

  const db = createServiceClient()

  // 업체 + 고객(거래처) — 둘 다 같은 업체 소속인지 확인
  const [{ data: business }, { data: customer }] = await Promise.all([
    db.from('businesses').select('name, phone').eq('id', businessId).maybeSingle(),
    db
      .from('customers')
      .select('id, name, phone, address')
      .eq('id', customerId)
      .eq('business_id', businessId)
      .maybeSingle(),
  ])

  if (!business || !customer) notFound()

  // 이 달의 방문 — 정기계약 방문은 customer_id로, 그 외는 전화번호로도 연결될 수 있어 함께 조회
  const orFilter = customer.phone
    ? `customer_id.eq.${customerId},customer_phone.eq.${customer.phone}`
    : `customer_id.eq.${customerId}`

  const { data: bookingsRaw } = (await db
    .from('bookings')
    .select('id, scheduled_at, status, worker_id, memo, contract_id, quotes!quote_id(cleaning_type)' as never)
    .eq('business_id', businessId)
    .or(orFilter)
    .gte('scheduled_at', range.startISO)
    .lt('scheduled_at', range.endISO)
    .is('deleted_at' as never, null)
    .not('status', 'in', '("cancelled","no_show")')
    .order('scheduled_at', { ascending: true })) as unknown as {
    data:
      | Array<{
          id: string
          scheduled_at: string
          status: string
          worker_id: string | null
          memo: string | null
          contract_id: string | null
          quotes: { cleaning_type: string | null } | null
        }>
      | null
  }

  const bookings = bookingsRaw ?? []

  // 담당자 이름 매핑
  const workerIds = [...new Set(bookings.map((b) => b.worker_id).filter(Boolean))] as string[]
  const workerMap = new Map<string, string>()
  if (workerIds.length > 0) {
    const { data: workers } = (await db
      .from('workers' as never)
      .select('id, name')
      .in('id' as never, workerIds)) as unknown as { data: { id: string; name: string }[] | null }
    for (const w of workers ?? []) workerMap.set(w.id, w.name)
  }

  // 방문별 작업 리포트 + 사진(after 우선)
  const bookingIds = bookings.map((b) => b.id)
  const reportMap = new Map<string, { notes: string | null; photos: { url: string; caption?: string }[] }>()
  if (bookingIds.length > 0) {
    const { data: reports } = (await db
      .from('reports')
      .select('id, booking_id, notes')
      .in('booking_id', bookingIds)) as unknown as {
      data: { id: string; booking_id: string; notes: string | null }[] | null
    }
    const reportIds = (reports ?? []).map((r) => r.id)
    const photosByReport = new Map<string, { url: string; caption?: string }[]>()
    if (reportIds.length > 0) {
      const { data: photos } = (await db
        .from('report_photos')
        .select('report_id, url, type, caption, sort_order')
        .in('report_id', reportIds)
        .order('sort_order', { ascending: true })) as unknown as {
        data: { report_id: string; url: string; type: string; caption: string | null }[] | null
      }
      for (const p of photos ?? []) {
        // 결과(after) 사진을 앞에 두어 '이렇게 깨끗해졌어요'를 강조
        const arr = photosByReport.get(p.report_id) ?? []
        const item = { url: p.url, caption: p.caption ?? undefined }
        if (p.type === 'after') arr.unshift(item)
        else arr.push(item)
        photosByReport.set(p.report_id, arr)
      }
    }
    for (const r of reports ?? []) {
      reportMap.set(r.booking_id, { notes: r.notes, photos: photosByReport.get(r.id) ?? [] })
    }
  }

  // 계약 정보(요약 카드용) — 이 고객의 계약 중 이 달과 겹치는 것
  const { data: contracts } = (await db
    .from('contracts')
    .select('service_type, frequency, contract_price, status')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)) as unknown as {
    data: { service_type: string | null; frequency: string; contract_price: number; status: string }[] | null
  }
  const contract = (contracts ?? []).find((c) => c.status === 'active') ?? (contracts ?? [])[0] ?? null

  const completedCount = bookings.filter((b) => b.status === 'completed').length
  const upcomingCount = bookings.filter((b) => b.status !== 'completed').length

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50/60 to-white">
      <div className="mx-auto max-w-xl px-4 py-8 space-y-5">
        {/* 헤더 */}
        <header className="text-center space-y-1.5">
          <p className="text-sm font-semibold text-emerald-600">{business.name}</p>
          <h1 className="text-2xl font-bold text-gray-900">{range.label} 작업 리포트</h1>
          <p className="text-sm text-gray-500">{customer.name} 담당자님께</p>
        </header>

        {/* 요약 카드 */}
        <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center rounded-xl bg-emerald-50 py-4">
              <p className="text-3xl font-bold text-emerald-600">{completedCount}회</p>
              <p className="text-xs text-gray-500 mt-1">이번 달 완료 방문</p>
            </div>
            <div className="text-center rounded-xl bg-gray-50 py-4">
              <p className="text-3xl font-bold text-gray-700">{upcomingCount}회</p>
              <p className="text-xs text-gray-500 mt-1">예정된 방문</p>
            </div>
          </div>
          {contract && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                {contract.service_type ?? '정기 청소'}
              </span>
              <span>{FREQUENCY_LABEL[contract.frequency] ?? contract.frequency} 방문</span>
              {contract.contract_price > 0 && (
                <span>월 {Math.round(contract.contract_price / 10000)}만원</span>
              )}
            </div>
          )}
        </section>

        {/* 방문 타임라인 */}
        {bookings.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            이번 달 방문 내역이 아직 없어요
          </div>
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-emerald-500" />
              방문 내역
            </h2>
            {bookings.map((b) => {
              const isDone = b.status === 'completed'
              const workerName = b.worker_id ? workerMap.get(b.worker_id) : null
              const report = reportMap.get(b.id)
              const service = b.quotes?.cleaning_type ?? b.memo ?? '정기 청소'
              return (
                <article key={b.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">{formatVisitDate(b.scheduled_at)}</span>
                    {isDone ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                        <CheckCircle2 className="h-3.5 w-3.5" />완료
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        <Clock className="h-3.5 w-3.5" />예정
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" />{service}
                    </span>
                    {workerName && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />{workerName}
                      </span>
                    )}
                  </div>
                  {report?.notes && (
                    <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{report.notes}</p>
                  )}
                  {report && report.photos.length > 0 && (
                    <ReportPhotoSection photos={report.photos} />
                  )}
                </article>
              )
            })}
          </section>
        )}

        {/* 푸터 — 업체 연락처 */}
        <footer className="text-center text-xs text-gray-400 pt-4 pb-8 space-y-1">
          <p className="font-medium text-gray-500">{business.name}</p>
          {business.phone && (
            <p className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />{business.phone}
            </p>
          )}
          <p className="pt-2">퀄리오로 작성된 작업 리포트예요</p>
        </footer>
      </div>
    </main>
  )
}
