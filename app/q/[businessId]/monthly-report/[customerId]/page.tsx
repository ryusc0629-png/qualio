import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CircleAlert, CalendarClock, Receipt } from 'lucide-react'
import { ReportPhotoSection } from '../../report/[reportId]/report-photos'
import { PrintReportButton } from './print-button'
import { DocPage, DocHeader, DocMeta, DocLede, DocSignature } from '@/components/report/document'
import { formatFrequency } from '@/lib/utils/frequency'
import { formatDate, toMarketYmd } from '@/lib/format/datetime'
import { formatMoney } from '@/lib/format/money'
import { buildMonthlyCharge, type ChargeContract } from '@/lib/reports/monthly-charge'
import { loadOneOffJobs } from '@/lib/reports/one-off-jobs'
import {
  buildMonthlySummary,
  buildHeadline,
  type VisitLike,
  type ReportLike,
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
  searchParams: Promise<{ month?: string; preview?: string }>
}

export default async function MonthlyReportPage({ params, searchParams }: PageProps) {
  const { businessId, customerId } = await params
  const { month, preview } = await searchParams
  const range = monthRange(month)
  // 사장님이 보내기 전에 직접 여는 미리보기(?preview=1) — 여기서만 '계좌 미등록' 같은 내부 안내를 띄운다.
  // 거래처가 받는 링크에는 이 파라미터가 없어 그대로 깨끗한 서류가 나간다.
  const isOwnerPreview = preview === '1'

  const db = createServiceClient()

  // 업체 + 고객(거래처) — 둘 다 같은 업체 소속인지 확인
  const [{ data: business }, { data: customer }] = await Promise.all([
    // payment_account = 설정 > 사업자 정보의 '정산(입금) 계좌' — 이번 달 청구 절의 입금 계좌로 그대로 쓴다
    db.from('businesses').select('name, phone, logo_url, favicon_url, payment_account' as never).eq('id', businessId).maybeSingle() as unknown as Promise<{ data: { name: string; phone: string | null; logo_url: string | null; favicon_url: string | null; payment_account: string | null } | null }>,
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
      'id, scheduled_at, status, worker_id, memo, customer_request, customer_request_done_at, contract_id, checkin_at, checkout_at, checklist_photos, quotes!quote_id(cleaning_type)' as never,
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
            customer_request_done_at: string | null
            contract_id: string | null
            quotes: { cleaning_type: string | null } | null
          }
        >
      | null
  }

  const bookings = bookingsRaw ?? []

  // ⛔ '담당 ○○○' 줄은 뺐다(사장님 결정 2026-08-22).
  //    거래처가 궁금한 건 '문제가 있었나, 처리됐나'지 누가 왔는지가 아니고,
  //    도급팀을 상호로 등록해 둔 업체가 있어 그대로 실으면 하청 사실이 드러난다.
  //    (실제로 닥터홍 8월분에 '담당 베이스케어'가 실릴 뻔했다. 되살리지 말 것.)

  // 방문별 작업 리포트 — 현장 특이사항을 모으는 용도.
  //
  // ⚠️ 방문 사진을 한데 모아 보여주던 '작업 사진' 절은 뺐다(사장님 결정 2026-08-19).
  //    맥락 없이 6장 깔아두면 정보가 아니라 여백이고, 정작 필요한 사진은
  //    요청·처리 내역에 붙어 있다. 되살리지 말 것.
  const bookingIds = bookings.map((b) => b.id)
  const reportRows: ReportLike[] = []

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

  }

  // 계약 정보 — 머리말(서비스·주기)과 '이번 달 청구' 금액에 함께 쓴다.
  // 기간·금액 이력까지 읽는 이유: 청구액은 '지금 금액'이 아니라 '그 달에 유효했던 금액'이어야 한다.
  const { data: contracts } = (await db
    .from('contracts')
    .select('id, service_type, frequency, contract_price, status, start_date, end_date, price_history' as never)
    .eq('business_id', businessId)
    .eq('customer_id', customerId)) as unknown as {
    data: ChargeContract[] | null
  }
  const contract = (contracts ?? []).find((c) => c.status === 'active') ?? (contracts ?? [])[0] ?? null

  // 사장님이 이 달 청구 금액을 직접 적었으면 그 값을 쓴다(일할 방식이 업체마다 달라서).
  // 발송 대기열(monthly_report_dispatches)에 적어둔 값 — 없으면 자동 계산값.
  const { data: dispatchRow } = (await (db as unknown as SupabaseClient)
    .from('monthly_report_dispatches')
    .select('charge_amount')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('period', range.key)
    .maybeSingle()) as unknown as { data: { charge_amount: number | null } | null }

  // 그 달 일회성 추가 작업 중 아직 못 받은 건 — 계약분 아래에 한 줄씩 합산한다
  const oneOffByCustomer = await loadOneOffJobs(
    db as unknown as SupabaseClient,
    businessId,
    [customerId],
    range.key,
  )

  // 이번 달 청구 — 그 달에 살아 있던 계약이 없으면 null이고, 문서에 절 자체를 그리지 않는다
  const charge = buildMonthlyCharge({
    contracts: contracts ?? [],
    billingMonth: range.key,
    customerId,
    issuedYmd: toMarketYmd(),
    overrideTotal: dispatchRow?.charge_amount ?? null,
    oneOffJobs: oneOffByCustomer.get(customerId) ?? [],
  })

  // 이번 달 접수된 문제·클레임 — 담당자가 가장 먼저 보는 항목이다.
  // (이 거래처의 이번 달 방문에 붙은 건만)
  const { data: issueRows } = (bookingIds.length > 0
    ? await db
        .from('claims' as never)
        .select('id, title, content, status, resolution, created_at, resolved_at, photo_urls, resolution_photo_urls, created_by_worker_id')
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
          photo_urls: string[] | null
          resolution_photo_urls: string[] | null
          created_by_worker_id: string | null
        }>
      | null
  }

  const summary = buildMonthlySummary({
    visits: bookings,
    reports: reportRows,
    now: new Date(),
    issues: (issueRows ?? []).map((r) => ({ ...r, createdByWorker: !!r.created_by_worker_id })),
    requests: bookings
      .filter((b) => b.customer_request)
      .map((b) => ({
        booking_id: b.id,
        scheduled_at: b.scheduled_at,
        request: b.customer_request!,
        done_at: b.customer_request_done_at ?? null,
      })),
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
  })

  const cycleLabel = contract?.frequency ? formatFrequency(contract.frequency) : null
  const paymentAccount = business.payment_account?.trim() ?? ''

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
      {/* ⚠️ 머리말에 있던 '월 금액'은 뺐다(2026-08-22). 그 값은 계약의 '지금 금액'이라,
             지난 달 보고서를 다시 열면 그때 받은 금액이 아니라 오늘 금액이 찍혔다.
             금액은 아래 '이번 달 청구' 한 곳에서만 말한다 — 그 달에 유효했던 금액으로.
             ⛔ 여기에 금액 줄을 되살리지 말 것. */}
      <DocMeta
        items={[
          { k: '거래처', v: customer.name },
          { k: '서비스', v: contract?.service_type ?? '정기 청소' },
          { k: '주기', v: cycleLabel && cycleLabel !== '—' ? cycleLabel : '' },
        ]}
      />

      <DocLede>{customer.name} 담당자님께 {range.label} 작업 내역을 아래와 같이 보고드립니다.</DocLede>

        {/* ── 한 줄 총평 — 표를 안 읽어도 이번 달을 알 수 있게.
             문서라서 색을 채우지 않고 왼쪽 선으로만 무게를 준다 ── */}
        <section className="mt-8 bg-emerald-50/70 border-l-4 border-emerald-500 px-5 py-4 break-inside-avoid">
          <p className="text-[13px] leading-7 text-slate-800">{headline}</p>
        </section>

        {/* ── 핵심 숫자 — 전부 '문제와 처리'에 대한 것만 둔다 ──
             방문 횟수·이행률·체류 시간·사진 장수·다음 달 예정 회차는 전부 뺐다
             (사장님 지적 2026-08-18): 그건 우리 사정이거나 계약서에 이미 있는 값이고,
             거래처 담당자가 궁금한 건 '문제가 있었나, 처리됐나'다.
             ⛔ 회차 지표를 다시 넣지 말 것. */}
        <section className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden border border-slate-200 bg-slate-200 break-inside-avoid">
          {/* 네 칸 모두 '건수'로 통일한다(사장님 결정 2026-08-19).
              요청사항 = 거래처가 말한 것(클레임 + 현장 요청) 전부
              처리     = 그중 처리 완료된 건
              특이사항 = 직원이 현장에서 남긴 것
              미리한 조치 = 문제 되기 전에 짚어 알려드린 것(향후 관리 안내) */}
          <Metric value={`${summary.issueCount + summary.requests.length}건`} label="요청사항" />
          {/* ⚠️ 분자는 클레임 처리 + 현장 요청 처리를 함께 센다.
              분모('요청사항')에는 현장 요청이 들어가는데 분자에는 안 들어가던 시절,
              직원이 현장 요청을 성실히 적을수록 우리가 일을 안 한 것처럼 보였다.
              ⛔ issueResolvedCount 하나만 쓰던 형태로 되돌리지 말 것. */}
          <Metric value={`${summary.issueResolvedCount + summary.requestDoneCount}건`} label="처리" accent />
          {/* ★ 특이사항 = 현장이 스스로 찾은 것. 정기 현장은 '금일 특이사항'(claims)으로 적고,
              일회성 현장은 보고서의 하자·특이사항 칸(preventive_note)에 적는다. 둘 다 센다.
              ⛔ preventive_note만 세던 형태로 되돌리지 말 것 — 정기 현장은 그 칸이 아예 없어
                 거래처 문서에 '특이사항 0건'이 나갔다(2026-08-21). */}
          <Metric value={`${summary.siteNotes.length + summary.fieldIssues.length}건`} label="특이사항" />
          <Metric value={`${carePlans.length}건`} label="미리한 조치" />
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
                  {it.photos.length > 0 && (
                    <div className="mt-2.5 max-w-[420px]">
                      <ReportPhotoSection photos={it.photos.map((u) => ({ url: u, caption: '요청 접수' }))} />
                    </div>
                  )}
                  {it.resolution && (
                    <p className="text-[13px] leading-[1.7] text-slate-700 mt-1.5 pl-3 border-l-2 border-emerald-300 whitespace-pre-wrap">
                      <span className="font-semibold">처리</span> · {it.resolution}
                    </p>
                  )}
                  {it.resolutionPhotos.length > 0 && (
                    <div className="mt-2.5 max-w-[420px]">
                      <p className="text-[11px] font-semibold text-emerald-600 mb-1.5">처리 후</p>
                      <ReportPhotoSection photos={it.resolutionPhotos.map((u) => ({ url: u, caption: '처리 후' }))} />
                    </div>
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
                    {r.done && (
                      <span className="rounded-sm border border-emerald-300 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        처리 완료
                      </span>
                    )}
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

        {/* ── 현장에서 확인한 것 — 거래처가 말하지 않았는데 우리가 찾아낸 것들.
             정기 현장은 '금일 특이사항'(claims), 일회성은 보고서의 하자·특이사항 칸에 적는다.
             둘은 적는 화면만 다를 뿐 성격이 같아 한 절에 모은다 ── */}
        {(summary.siteNotes.length > 0 || summary.fieldIssues.length > 0) && (
          <Section icon={<CircleAlert className="h-4 w-4" />} title="현장에서 확인한 것">
            <p className="text-[12px] text-slate-500 mb-3">
              요청하지 않으셨지만 저희가 확인해 챙긴 부분이에요
            </p>

            {summary.fieldIssues.length > 0 && (
              <ul className="divide-y divide-slate-200 border-y border-slate-200 mb-3.5">
                {summary.fieldIssues.map((it, i) => (
                  <li key={`field-${i}`} className="py-3.5">
                    <div className="flex items-start gap-3.5">
                      <span className="mt-0.5 shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700 print:bg-emerald-50">
                        {formatShortDate(it.date)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-slate-800">{it.title}</p>
                        {it.detail && (
                          <p className="text-[13px] leading-[1.65] text-slate-600 mt-1 whitespace-pre-wrap">{it.detail}</p>
                        )}
                        {it.resolution && (
                          <p className="text-[13px] leading-[1.65] text-slate-700 mt-1.5">
                            <span className="font-semibold text-emerald-700">조치</span> {it.resolution}
                          </p>
                        )}
                        {it.photos.length > 0 && (
                          <div className="mt-2">
                            <ReportPhotoSection photos={it.photos.map((u) => ({ url: u, caption: '확인' }))} />
                          </div>
                        )}
                        {it.resolutionPhotos.length > 0 && (
                          <div className="mt-2">
                            <ReportPhotoSection photos={it.resolutionPhotos.map((u) => ({ url: u, caption: '조치 후' }))} />
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {summary.siteNotes.length > 0 && (
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
            )}
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

        {/* ── 이번 달 청구 — 문서 맨 끝, 서명 바로 앞 ──────────────────────
             왜 여기인가: 담당자는 "이런 일을 했다"를 다 읽고 마지막에 "그래서 얼마"를 본다.
             왜 링크가 아니라 금액·계좌를 문서에 박는가: 이 한 장이 그대로 결재에 올라가야 한다.
             링크만 두면 종이로 뽑는 순간 죽고, 담당자는 청구서를 다시 찾아야 한다.
             ⚠️ 금액은 계약(그 달 유효 금액) 한 곳에서만 나온다 — lib/reports/monthly-charge.ts */}
        {charge && (paymentAccount ? (
          <Section icon={<Receipt className="h-4 w-4" />} title="이번 달 청구">
            <div className="divide-y divide-slate-100 border-y border-slate-200">
              <ChargeRow k="청구 대상" v={`${range.label}분`} />
              <ChargeRow k="청구번호" v={charge.invoiceNo} />
              {/* 계약이 하나면 위 '청구 대상'과 겹치므로 금액을 또 적지 않는다.
                  여러 개면 무엇에 대한 돈인지 계약별로 보여야 담당자가 알아본다.
                  ⚠️ 사장님이 금액을 직접 적은 달은 계약별 금액을 감춘다 — 줄 합이 총액과 안 맞는다. */}
              {charge.rows.length === 1 ? (
                <ChargeRow k="내역" v={charge.rows[0].label} note={charge.rows[0].note} />
              ) : (
                charge.rows.map((r, i) => (
                  <ChargeRow
                    key={i}
                    k={r.label}
                    v={charge.adjusted ? '' : formatMoney(r.amount)}
                    note={r.note}
                  />
                ))
              )}
            </div>

            <div className="mt-4 flex items-end justify-between gap-4 border-y-2 border-slate-900 py-4">
              <span className="text-[13px] font-semibold text-slate-600">청구 금액</span>
              <div className="text-right">
                <p className="text-[26px] leading-none font-bold tabular-nums text-slate-900">
                  {formatMoney(charge.total)}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-400">부가세 별도</p>
              </div>
            </div>

            <div className="mt-4 border-2 border-slate-900 px-4 py-3.5">
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500">입금 계좌</p>
              <p className="text-[15px] font-bold text-slate-900 break-keep">{paymentAccount}</p>
              <p className="mt-1.5 text-[12.5px] text-slate-600">
                {formatDate(charge.dueYmd)}까지 입금해 주세요.
              </p>
            </div>
          </Section>
        ) : isOwnerPreview ? (
          // 계좌가 없으면 청구서 구실을 못 한다. 거래처엔 절 자체를 안 보내고, 사장님에게만 알린다.
          <div className="mt-8 rounded-lg border-2 border-red-300 bg-red-50 p-4 print:hidden">
            <p className="text-[13px] font-bold text-red-700">
              입금 계좌가 없어서 &lsquo;이번 달 청구&rsquo;가 빠진 채로 나가요
            </p>
            <p className="mt-1 text-[13px] leading-6 text-red-700">
              설정 &gt; 사업자 정보의 &lsquo;정산(입금) 계좌&rsquo;를 채우면 이 자리에 {formatMoney(charge.total)} 청구가 들어가요.
              거래처가 받는 보고서에는 이 빨간 안내가 보이지 않아요.
            </p>
          </div>
        ) : null)}

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

// 청구 절의 한 줄 — 이름/값. components/report/document.tsx 의 DocRows와 같은 결.
// note는 한 달을 다 채우지 못한 달의 근거('4일 시작 · 30일 중 27일') — 담당자가 금액을 납득하게 한다.
function ChargeRow({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <span className="text-[12px] text-slate-500">{k}</span>
        {note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}
      </div>
      {v && (
        <span className="min-w-0 break-words text-right text-[13px] font-medium tabular-nums text-slate-900">{v}</span>
      )}
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
