import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PrintReportButton } from '../../monthly-report/[customerId]/print-button'
import { formatDate } from '@/lib/format/datetime'
import {
  DocPage, DocHeader, DocMeta, DocLede, DocSection, DocText, DocCallout, DocSignature,
} from '@/components/report/document'
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
    <DocPage action={<PrintReportButton />}>
      <DocHeader
        businessName={business.name}
        businessPhone={business.phone}
        title="초도 작업 리포트"
        docNo={docNo}
      />
      <DocMeta items={meta} />

      <DocLede>
        {customer?.name ? `${customer.name} 담당자님, ` : ''}첫 작업을 마쳤습니다.
        현장에서 확인한 상태와 진행한 작업, 앞으로의 관리 계획을 아래와 같이 정리해 드립니다.
      </DocLede>

      {report.before_note && (
        <DocSection no="01" title="현장 진단">
          <DocText>{report.before_note}</DocText>
        </DocSection>
      )}

      {report.spec_note && (
        <DocSection no="02" title="진행한 작업">
          <DocText>{report.spec_note}</DocText>
        </DocSection>
      )}

      {items.length > 0 && (
        <DocSection no="03" title="확인 · 작업 내역">
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
                      라벨은 항상 한글 — 거래처 문서에 영문 라벨을 섞지 않는다. */}
                  {(it.beforeUrl || it.afterUrl) && (
                    <div className="grid grid-cols-2 gap-3 mt-3 pl-7 max-w-[460px]">
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
        </DocSection>
      )}

      {report.management_note && (
        <DocSection no="04" title="앞으로의 관리 계획">
          <DocCallout>
            <p className="whitespace-pre-wrap">{report.management_note}</p>
          </DocCallout>
        </DocSection>
      )}

      <DocSignature
        businessName={business.name}
        businessPhone={business.phone}
        issuedLabel={formatDate(issuedAt)}
      />
    </DocPage>
  )
}
