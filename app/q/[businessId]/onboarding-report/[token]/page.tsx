import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PrintReportButton } from '../../monthly-report/[customerId]/print-button'
import { formatDate } from '@/lib/format/datetime'
import {
  RESOLUTION_LABEL,
  RESULT_LABEL,
  type OnboardingItem,
  type ResultKind,
} from '@/lib/onboarding/types'

interface PageProps {
  params: Promise<{ businessId: string; token: string }>
}

// 결과 배지 — 문서라서 색을 절제하고 테두리로 구분한다
function resultBadge(result: ResultKind): { label: string; cls: string } | null {
  if (result === 'resolved')
    return { label: RESULT_LABEL.resolved, cls: 'border-emerald-300 text-emerald-700 bg-emerald-50' }
  if (result === 'partial')
    return { label: RESULT_LABEL.partial, cls: 'border-amber-300 text-amber-700 bg-amber-50' }
  if (result === 'paid_recommend')
    return { label: RESULT_LABEL.paid_recommend, cls: 'border-slate-300 text-slate-700 bg-slate-50' }
  return null
}

// 섹션 제목 — 01, 02 … 번호를 달아 서류처럼 읽히게 한다
function SectionTitle({ no, children }: { no: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b-2 border-slate-900 pb-1.5 mb-3">
      <span className="text-[11px] font-bold tracking-widest text-emerald-600 tabular-nums">{no}</span>
      <h2 className="text-[13px] font-bold tracking-tight text-slate-900">{children}</h2>
    </div>
  )
}

export default async function OnboardingReportPublicPage({ params }: PageProps) {
  const { businessId, token } = await params
  const db = createServiceClient()

  const { data: report } = (await db
    .from('onboarding_reports' as never)
    .select('customer_id, contract_id, before_note, spec_note, management_note, items, status, created_at, shared_at')
    .eq('business_id' as never, businessId)
    .eq('public_token' as never, token)
    .maybeSingle()) as unknown as {
    data: {
      customer_id: string
      contract_id: string | null
      before_note: string | null
      spec_note: string | null
      management_note: string | null
      items: OnboardingItem[] | null
      status: string
      created_at: string
      shared_at: string | null
    } | null
  }

  if (!report) notFound()

  const [{ data: business }, { data: customer }, { data: contract }] = await Promise.all([
    db.from('businesses').select('name, phone').eq('id', businessId).maybeSingle(),
    db.from('customers').select('name, address').eq('id', report.customer_id).maybeSingle(),
    report.contract_id
      ? db.from('contracts').select('service_type').eq('id', report.contract_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!business) notFound()

  const items = (report.items ?? []).filter((it) => it.space || it.problem || it.beforeUrl || it.afterUrl)

  // 발행일 — 거래처에 보낸 날이 있으면 그날, 아직이면 작성일
  const issuedAt = report.shared_at ?? report.created_at
  // 문서번호 — 서류처럼 보이게. 토큰 앞 4자리로 문서마다 구분된다
  const docNo = `IR-${issuedAt.slice(2, 4)}${issuedAt.slice(5, 7)}${issuedAt.slice(8, 10)}-${token.slice(0, 4).toUpperCase()}`

  const meta: Array<{ k: string; v: string }> = [
    { k: '거래처', v: customer?.name ?? '-' },
    { k: '현장', v: customer?.address ?? '-' },
    { k: '서비스', v: (contract as { service_type?: string | null } | null)?.service_type ?? '정기 관리' },
    { k: '발행일', v: formatDate(issuedAt) },
  ]

  return (
    <main className="min-h-screen bg-slate-100 py-6 px-3 print:bg-white print:p-0 [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
      <div className="mx-auto max-w-[860px] print:max-w-none">
        <div className="flex justify-end mb-3 print:hidden">
          <PrintReportButton />
        </div>

        {/* 문서 본체 — 화면에선 종이 한 장처럼, 인쇄하면 A4 */}
        <article className="bg-white shadow-sm ring-1 ring-slate-200 px-6 py-8 sm:px-12 sm:py-12 print:shadow-none print:ring-0 print:px-0 print:py-0">

          {/* ── 문서 머리 ───────────────────────────── */}
          <header className="flex items-start justify-between gap-4 border-b-4 border-slate-900 pb-4">
            <div className="min-w-0">
              <p className="text-base font-bold tracking-tight text-slate-900">{business.name}</p>
              {business.phone && (
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{business.phone}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-[-0.02em] text-slate-900">초도 작업 리포트</h1>
              <p className="text-[10px] tracking-widest text-slate-400 mt-1 tabular-nums">{docNo}</p>
            </div>
          </header>

          {/* ── 문서 정보 표 ────────────────────────── */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 border-b border-slate-200">
            {meta.map((m) => (
              <div key={m.k} className="flex gap-3 py-2.5 border-b border-slate-100 last:border-0 sm:[&:nth-last-child(-n+2)]:border-0">
                <dt className="w-16 shrink-0 text-[11px] font-semibold text-slate-500 pt-px">{m.k}</dt>
                <dd className="text-[13px] text-slate-900 min-w-0 break-words">{m.v}</dd>
              </div>
            ))}
          </dl>

          {/* ── 인사 ──────────────────────────────── */}
          <p className="text-[13px] leading-7 text-slate-700 mt-7">
            {customer?.name ? `${customer.name} 담당자님, ` : ''}첫 작업을 마쳤습니다.
            현장에서 확인한 상태와 진행한 작업, 앞으로의 관리 계획을 아래와 같이 정리해 드립니다.
          </p>

          {/* ── 01 현장 진단 ───────────────────────── */}
          {report.before_note && (
            <section className="mt-8 break-inside-avoid">
              <SectionTitle no="01">현장 진단</SectionTitle>
              <p className="text-[13px] leading-7 text-slate-700 whitespace-pre-wrap">{report.before_note}</p>
            </section>
          )}

          {/* ── 02 작업 시방 ───────────────────────── */}
          {report.spec_note && (
            <section className="mt-8 break-inside-avoid">
              <SectionTitle no="02">진행한 작업</SectionTitle>
              <p className="text-[13px] leading-7 text-slate-700 whitespace-pre-wrap">{report.spec_note}</p>
            </section>
          )}

          {/* ── 03 항목별 내역 ─────────────────────── */}
          {items.length > 0 && (
            <section className="mt-8">
              <SectionTitle no="03">확인 · 작업 내역</SectionTitle>
              <ol className="divide-y divide-slate-200 border-y border-slate-200">
                {items.map((it, i) => {
                  const rb = resultBadge(it.result)
                  return (
                    <li key={it.id} className="py-5 break-inside-avoid">
                      <div className="flex items-baseline gap-2.5 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[14px] font-bold text-slate-900">{it.space || '현장'}</span>
                        <span className="text-[10px] font-medium text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">
                          {RESOLUTION_LABEL[it.resolution]}
                        </span>
                        {rb && (
                          <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded ${rb.cls}`}>
                            {rb.label}
                          </span>
                        )}
                      </div>

                      {it.problem && (
                        <p className="text-[13px] leading-7 text-slate-700 whitespace-pre-wrap mt-2 pl-7">
                          {it.problem}
                        </p>
                      )}

                      {/* 전·후 둘 다 있으면 나란히, 한 장만 있으면 그 한 장만.
                          현장에서 늘 두 장을 찍는 건 아니다 — 빈 칸을 남겨 문서가 미완성으로 보이면 안 된다.
                          라벨은 항상 한글('작업 전'·'작업 후') — 거래처 문서에 영문 라벨을 섞지 않는다. */}
                      {(it.beforeUrl || it.afterUrl) && (
                        <div className={`grid gap-3 mt-3 pl-7 ${it.beforeUrl && it.afterUrl ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-2'}`}>
                          {it.beforeUrl && (
                            <figure>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={it.beforeUrl} alt="작업 전" className="w-full aspect-[4/3] object-cover rounded ring-1 ring-slate-200" />
                              <figcaption className="text-[11px] font-semibold text-slate-400 mt-1">작업 전</figcaption>
                            </figure>
                          )}
                          {it.afterUrl && (
                            <figure>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={it.afterUrl} alt="작업 후" className="w-full aspect-[4/3] object-cover rounded ring-1 ring-emerald-200" />
                              <figcaption className="text-[11px] font-semibold text-emerald-600 mt-1">작업 후</figcaption>
                            </figure>
                          )}
                        </div>
                      )}

                      {it.nextAction && (
                        <p className="text-[12px] leading-6 text-slate-500 mt-2.5 pl-7 border-l-2 border-slate-200 ml-0.5">
                          <span className="font-semibold text-slate-600">다음 제안</span> · {it.nextAction}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          {/* ── 04 관리 계획 ───────────────────────── */}
          {report.management_note && (
            <section className="mt-8 break-inside-avoid">
              <SectionTitle no="04">앞으로의 관리 계획</SectionTitle>
              <div className="bg-emerald-50/70 border-l-4 border-emerald-500 px-5 py-4">
                <p className="text-[13px] leading-7 text-slate-800 whitespace-pre-wrap">{report.management_note}</p>
              </div>
            </section>
          )}

          {/* ── 발행 ──────────────────────────────── */}
          <footer className="mt-12 pt-5 border-t border-slate-200 break-inside-avoid">
            <p className="text-[12px] text-slate-500">
              {formatDate(issuedAt)}
            </p>
            <div className="flex items-end justify-between gap-4 mt-3">
              <div>
                <p className="text-[15px] font-bold text-slate-900">{business.name}</p>
                {business.phone && (
                  <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">문의 {business.phone}</p>
                )}
              </div>
              <span className="text-[10px] text-slate-300">(인)</span>
            </div>
          </footer>
        </article>

        <p className="text-center text-[10px] text-slate-400 mt-4 pb-6 print:hidden">
          퀄리오로 작성된 작업 리포트예요
        </p>
      </div>
    </main>
  )
}
