import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ClipboardCheck, CircleAlert, Camera, CalendarClock } from 'lucide-react'
import { ReportPhotoSection } from '../../report/[reportId]/report-photos'
import { PrintReportButton } from './print-button'
import { DocPage, DocHeader, DocMeta, DocLede, DocSignature } from '@/components/report/document'
import { formatFrequency } from '@/lib/utils/frequency'
import {
  buildMonthlySummary,
  buildHeadline,
  type VisitLike,
  type ReportLike,
  type ChecklistItem,
} from '@/lib/reports/monthly-summary'

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


function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
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
    db.from('businesses').select('name, phone, logo_url, favicon_url' as never).eq('id', businessId).maybeSingle() as unknown as Promise<{ data: { name: string; phone: string | null; logo_url: string | null; favicon_url: string | null } | null }>,
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
    .select(
      'id, scheduled_at, status, worker_id, memo, customer_request, contract_id, checkin_at, checkout_at, checklist_photos, quotes!quote_id(cleaning_type)' as never,
    )
    .eq('business_id', businessId)
    .or(orFilter)
    .gte('scheduled_at', range.startISO)
    .lt('scheduled_at', range.endISO)
    .is('deleted_at' as never, null)
    .not('status', 'in', '("cancelled","no_show")')
    .order('scheduled_at', { ascending: true })) as unknown as {
    data:
      | Array<
          VisitLike & {
            memo: string | null
            customer_request: string | null
            contract_id: string | null
            quotes: { cleaning_type: string | null } | null
          }
        >
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

  // 방문별 작업 리포트 + 사진(after 우선) — 사진은 이번 달 대표 컷으로 모아 보여준다
  const bookingIds = bookings.map((b) => b.id)
  const reportRows: ReportLike[] = []
  const galleryPhotos: { url: string; caption?: string }[] = []
  let totalPhotoCount = 0

  if (bookingIds.length > 0) {
    const { data: reports } = (await db
      .from('reports')
      .select('id, booking_id, notes, preventive_note')
      .in('booking_id', bookingIds)) as unknown as {
      data: { id: string; booking_id: string; notes: string | null; preventive_note: string | null }[] | null
    }
    for (const r of reports ?? []) {
      reportRows.push({ booking_id: r.booking_id, notes: r.notes, preventive_note: r.preventive_note })
    }

    const reportIds = (reports ?? []).map((r) => r.id)
    if (reportIds.length > 0) {
      const bookingIdByReport = new Map((reports ?? []).map((r) => [r.id, r.booking_id]))
      const dateByBooking = new Map(bookings.map((b) => [b.id, b.scheduled_at]))

      const { data: photos } = (await db
        .from('report_photos')
        .select('report_id, url, type, caption, sort_order')
        .in('report_id', reportIds)
        .order('sort_order', { ascending: true })) as unknown as {
        data: { report_id: string; url: string; type: string; caption: string | null }[] | null
      }
      totalPhotoCount = (photos ?? []).length

      // 결과(after) 사진 우선 — 방문 날짜를 캡션으로 붙여 '언제 찍힌 건지' 바로 보이게
      const withDate = (photos ?? []).map((p) => {
        const bookingId = bookingIdByReport.get(p.report_id)
        const at = bookingId ? dateByBooking.get(bookingId) : null
        return {
          url: p.url,
          caption: p.caption ?? (at ? `${formatShortDate(at)} 작업` : undefined),
          isAfter: p.type === 'after',
        }
      })
      galleryPhotos.push(
        ...withDate.filter((p) => p.isAfter).map(({ url, caption }) => ({ url, caption })),
        ...withDate.filter((p) => !p.isAfter).map(({ url, caption }) => ({ url, caption })),
      )
    }
  }

  // 계약 정보 — 이 고객의 계약 중 진행 중인 것 우선. 작업 항목(체크리스트)도 함께.
  const { data: contracts } = (await db
    .from('contracts')
    .select('service_type, frequency, contract_price, status, checklist_items' as never)
    .eq('business_id', businessId)
    .eq('customer_id', customerId)) as unknown as {
    data:
      | {
          service_type: string | null
          frequency: string
          contract_price: number
          status: string
          checklist_items: ChecklistItem[] | null
        }[]
      | null
  }
  const contract = (contracts ?? []).find((c) => c.status === 'active') ?? (contracts ?? [])[0] ?? null

  // 이번 달 접수된 문제·클레임 — 담당자가 가장 먼저 보는 항목이다.
  // (이 거래처의 이번 달 방문에 붙은 건만)
  const { data: issueRows } = (bookingIds.length > 0
    ? await db
        .from('claims' as never)
        .select('id, title, content, status, resolution, created_at, resolved_at')
        .eq('business_id' as never, businessId)
        .in('booking_id' as never, bookingIds)
    : { data: [] }) as unknown as {
    data:
      | Array<{
          id: string
          title: string | null
          content: string | null
          status: string
          resolution: string | null
          created_at: string
          resolved_at: string | null
        }>
      | null
  }

  const summary = buildMonthlySummary({
    visits: bookings,
    reports: reportRows,
    checklistItems: contract?.checklist_items ?? [],
    workerNames: workerMap,
    photoCount: totalPhotoCount,
    now: new Date(),
    issues: issueRows ?? [],
    requests: bookings
      .filter((b) => b.customer_request)
      .map((b) => ({ booking_id: b.id, scheduled_at: b.scheduled_at, request: b.customer_request! })),
  })

  // 다음에 손봐야 할 것 — 보고서에 적어둔 관리 소견 중 아직 안 지난 것
  const { data: careRows } = (reportRows.length > 0
    ? await db
        .from('reports' as never)
        .select('care_advice, care_due_at')
        .in('booking_id' as never, bookingIds)
        .not('care_advice', 'is', null)
    : { data: [] }) as unknown as {
    data: Array<{ care_advice: string | null; care_due_at: string | null }> | null
  }
  const carePlans = (careRows ?? [])
    .filter((c) => c.care_advice?.trim())
    .map((c) => ({ advice: c.care_advice!.trim(), dueAt: c.care_due_at }))

  const serviceName = contract?.service_type ?? bookings[0]?.quotes?.cleaning_type ?? null
  const headline = buildHeadline({
    summary,
    monthLabel: range.label,
    serviceName,
    frequency: contract?.frequency ?? null,
  })

  const cycleLabel = contract?.frequency ? formatFrequency(contract.frequency) : null
  const topPhotos = galleryPhotos.slice(0, 6)
  const maxTaskCount = summary.taskCounts[0]?.count ?? 0

  return (
    <DocPage action={<PrintReportButton />}>
      <DocHeader
        businessName={business.name}
        businessPhone={business.phone}
        businessLogoUrl={business.logo_url}
        businessFaviconUrl={business.favicon_url}
        title={`${range.label} 작업 보고서`}
        docNo={`MR-${range.label.replace(/[^0-9]/g, '')}`}
      />
      <DocMeta
        items={[
          { k: '거래처', v: customer.name },
          { k: '서비스', v: contract?.service_type ?? '정기 청소' },
          { k: '주기', v: cycleLabel && cycleLabel !== '—' ? cycleLabel : '' },
          {
            k: '월 금액',
            v: contract && contract.contract_price > 0
              ? `${contract.contract_price.toLocaleString('ko-KR')}원 (부가세 별도)`
              : '',
          },
        ]}
      />

      <DocLede>{customer.name} 담당자님께 {range.label} 작업 내역을 아래와 같이 보고드립니다.</DocLede>

        {/* ── 한 줄 총평 — 표를 안 읽어도 이번 달을 알 수 있게.
             문서라서 색을 채우지 않고 왼쪽 선으로만 무게를 준다 ── */}
        <section className="mt-8 bg-emerald-50/70 border-l-4 border-emerald-500 px-5 py-4 break-inside-avoid">
          <p className="text-[13px] leading-7 text-slate-800">{headline}</p>
          {summary.workerNames.length > 0 && (
            <p className="mt-2 text-[12px] text-slate-500">
              담당 {summary.workerNames.join(' · ')}
            </p>
          )}
        </section>

        {/* ── 핵심 숫자 — 전부 '문제와 처리'에 대한 것만 둔다 ──
             방문 횟수·이행률·체류 시간·사진 장수·다음 달 예정 회차는 전부 뺐다
             (사장님 지적 2026-08-18): 그건 우리 사정이거나 계약서에 이미 있는 값이고,
             거래처 담당자가 궁금한 건 '문제가 있었나, 처리됐나'다.
             ⛔ 회차 지표를 다시 넣지 말 것. */}
        <section className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden border border-slate-200 bg-slate-200 break-inside-avoid">
          <Metric value={`${summary.issueCount}건`} label="접수된 요청" />
          <Metric value={`${summary.issueResolvedCount}건`} label="처리 완료" />
          <Metric
            value={summary.issueResolveRate !== null ? `${summary.issueResolveRate}%` : '—'}
            label="처리율"
            accent
          />
          <Metric value={`${summary.siteNotes.length}건`} label="미리 발견해 조치" />
        </section>

        {/* ── 요청 · 처리 내역 — 이 보고서에서 제일 먼저 읽히는 부분 ── */}
        {(summary.issues.length > 0 || summary.requests.length > 0) && (
          <Section icon={<CircleAlert className="h-4 w-4" />} title="요청 · 처리 내역">
            <p className="text-[12px] text-slate-500 mb-3">
              접수된 요청과 처리 결과예요
            </p>
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {summary.issues.map((it, i) => (
                <li key={`issue-${i}`} className="py-3.5">
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <span className="text-[12px] font-semibold text-slate-400 tabular-nums shrink-0">
                      {formatShortDate(it.date)}
                    </span>
                    <span className="text-[14px] font-semibold text-slate-900">{it.title}</span>
                    <span
                      className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded ${
                        it.resolved
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                          : 'border-amber-300 text-amber-700 bg-amber-50'
                      }`}
                    >
                      {it.resolved ? '처리 완료' : '진행 중'}
                    </span>
                  </div>
                  {it.detail && (
                    <p className="text-[13px] leading-[1.7] text-slate-600 mt-1.5 whitespace-pre-wrap">{it.detail}</p>
                  )}
                  {it.resolution && (
                    <p className="text-[13px] leading-[1.7] text-slate-700 mt-1.5 pl-3 border-l-2 border-emerald-300 whitespace-pre-wrap">
                      <span className="font-semibold">처리</span> · {it.resolution}
                    </p>
                  )}
                </li>
              ))}
              {summary.requests.map((r, i) => (
                <li key={`req-${i}`} className="py-3.5">
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <span className="text-[12px] font-semibold text-slate-400 tabular-nums shrink-0">
                      {formatShortDate(r.date)}
                    </span>
                    <span className="text-[14px] font-semibold text-slate-900">현장 요청</span>
                  </div>
                  <p className="text-[13px] leading-[1.7] text-slate-600 mt-1.5 whitespace-pre-wrap">{r.note}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {summary.issues.length === 0 && summary.requests.length === 0 && (
          <Section icon={<CircleAlert className="h-4 w-4" />} title="요청 · 처리 내역">
            <p className="text-[13px] text-slate-500">
              이번 달 접수된 요청이나 문제는 없었습니다.
            </p>
          </Section>
        )}

        {/* ── 이번 달 수행한 작업 ── */}
        {summary.taskCounts.length > 0 && (
          <Section icon={<ClipboardCheck className="h-4 w-4" />} title="이번 달 수행한 작업">
            <p className="text-[12px] text-slate-500 mb-3">
              작업 항목마다 현장 사진으로 확인된 횟수예요
            </p>
            <ul className="space-y-2.5">
              {summary.taskCounts.map((t) => (
                <li key={t.label} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-[14px] text-slate-700">{t.label}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 print:bg-emerald-500"
                      style={{ width: `${maxTaskCount > 0 ? Math.max(8, (t.count / maxTaskCount) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-slate-900">
                    {t.count}회
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── 현장에서 확인한 것 — 직원이 매 방문 남긴 특이사항이 여기로 모인다 ── */}
        {summary.siteNotes.length > 0 && (
          <Section icon={<CircleAlert className="h-4 w-4" />} title="현장에서 확인한 것">
            <p className="text-[12px] text-slate-500 mb-3">
              문제가 되기 전에 미리 챙긴 것과, 다음에 지켜볼 부분이에요
            </p>
            <ul className="space-y-3.5">
              {summary.siteNotes.map((n, i) => (
                <li key={i} className="flex gap-3.5">
                  <span className="mt-0.5 shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700 print:bg-emerald-50">
                    {formatShortDate(n.date)}
                  </span>
                  <p className="text-[14px] leading-[1.65] text-slate-700 whitespace-pre-wrap">{n.note}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── 작업 사진 ── */}
        {topPhotos.length > 0 && (
          <Section icon={<Camera className="h-4 w-4" />} title="작업 사진">
            <p className="text-[12px] text-slate-500 mb-3">
              이번 달 현장에서 찍은 사진이에요
              {summary.photoCount > topPhotos.length && ` (전체 ${summary.photoCount}장 중 ${topPhotos.length}장)`}
            </p>
            <ReportPhotoSection photos={topPhotos} />
          </Section>
        )}

        {/* ── 익월 작업 계획 — 보고서를 '지난달 정산'이 아니라 '관리 계약'으로 읽히게 한다.
             지어내지 않고 실제 데이터만 엮는다: 예정 방문 수 · 이월된 미해결 건 · 적어둔 관리 소견 ── */}
        {(summary.carriedOver.length > 0 || carePlans.length > 0) && (
          <Section icon={<CalendarClock className="h-4 w-4" />} title="다음 달 작업 계획">
            <ul className="space-y-3">
              {summary.carriedOver.map((c, i) => (
                <li key={`carry-${i}`} className="flex gap-3">
                  <span className="mt-0.5 shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-700">
                    이월
                  </span>
                  <p className="text-[14px] leading-[1.65] text-slate-700">
                    {c.title} — 이어서 처리하겠습니다.
                  </p>
                </li>
              ))}
              {carePlans.map((c, i) => (
                <li key={`care-${i}`} className="flex gap-3">
                  <span className="mt-0.5 shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">
                    관리
                  </span>
                  <p className="text-[14px] leading-[1.65] text-slate-700 whitespace-pre-wrap">{c.advice}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {bookings.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-200 py-14 text-center">
            <p className="text-[14px] text-slate-400">{range.label}에 기록된 방문이 없어요</p>
          </div>
        )}

        <DocSignature
          businessName={business.name}
          businessPhone={business.phone}
          issuedLabel={`${range.label} 작업 보고`}
        />
    </DocPage>
  )
}

// ── 화면 조각 ──────────────────────────────────────────────

function Metric({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`px-4 py-5 text-center ${accent ? 'bg-emerald-50 print:bg-emerald-50' : 'bg-white'}`}>
      <p className={`text-[22px] font-bold tracking-tight tabular-nums ${accent ? 'text-emerald-700' : 'text-slate-900'}`}>
        {value}
      </p>
      <p className="mt-1 text-[12px] text-slate-500">{label}</p>
    </div>
  )
}

// 문서 절 — 카드가 아니라 밑줄 제목. components/report/document.tsx 의 DocSection과 같은 결.
// (여기만 아이콘을 쓰는 이유: 표·그래프가 섞인 절이라 눈으로 구획을 잡아주는 게 낫다)
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8 break-inside-avoid">
      <div className="flex items-center gap-2 border-b-2 border-slate-900 pb-1.5 mb-3">
        <span className="text-emerald-600">{icon}</span>
        <h2 className="text-[13px] font-bold tracking-tight text-slate-900">{title}</h2>
      </div>
      {children}
    </section>
  )
}
