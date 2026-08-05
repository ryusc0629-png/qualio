import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Phone, Sparkles, CheckCircle2, AlertTriangle, Wrench } from 'lucide-react'
import { PrintReportButton } from '../../monthly-report/[customerId]/print-button'
import {
  RESOLUTION_LABEL,
  RESULT_LABEL,
  type OnboardingItem,
  type ResultKind,
} from '@/lib/onboarding/types'

interface PageProps {
  params: Promise<{ businessId: string; token: string }>
}

// 결과 배지 색/아이콘
function resultBadge(result: ResultKind) {
  if (result === 'resolved')
    return { label: RESULT_LABEL.resolved, cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 }
  if (result === 'partial')
    return { label: RESULT_LABEL.partial, cls: 'bg-amber-50 text-amber-700', Icon: AlertTriangle }
  if (result === 'paid_recommend')
    return { label: RESULT_LABEL.paid_recommend, cls: 'bg-indigo-50 text-indigo-700', Icon: Wrench }
  return null
}

export default async function OnboardingReportPublicPage({ params }: PageProps) {
  const { businessId, token } = await params
  const db = createServiceClient()

  const { data: report } = (await db
    .from('onboarding_reports' as never)
    .select('customer_id, before_note, spec_note, management_note, items, status')
    .eq('business_id' as never, businessId)
    .eq('public_token' as never, token)
    .maybeSingle()) as unknown as {
    data: {
      customer_id: string
      before_note: string | null
      spec_note: string | null
      management_note: string | null
      items: OnboardingItem[] | null
      status: string
    } | null
  }

  if (!report) notFound()

  const [{ data: business }, { data: customer }] = await Promise.all([
    db.from('businesses').select('name, phone').eq('id', businessId).maybeSingle(),
    db.from('customers').select('name').eq('id', report.customer_id).maybeSingle(),
  ])
  if (!business) notFound()

  const items = (report.items ?? []).filter((it) => it.space || it.problem || it.beforeUrl || it.afterUrl)

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50/60 to-white print:bg-white print:from-white [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
      <div className="mx-auto max-w-xl px-4 py-8 space-y-5 print:py-2">
        {/* 헤더 */}
        <header className="text-center space-y-1.5">
          <p className="text-sm font-semibold text-emerald-600">{business.name}</p>
          <h1 className="text-2xl font-bold text-gray-900">초도 작업 리포트</h1>
          {customer?.name && <p className="text-sm text-gray-500">{customer.name} 담당자님께</p>}
        </header>

        <div className="flex justify-center print:hidden">
          <PrintReportButton />
        </div>

        {/* 현황 요약 */}
        {report.before_note && (
          <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm break-inside-avoid">
            <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{report.before_note}</p>
          </section>
        )}

        {/* 작업 시방 */}
        {report.spec_note && (
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm break-inside-avoid space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">이렇게 작업했습니다</h2>
            <p className="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">{report.spec_note}</p>
          </section>
        )}

        {/* 문제 · 작업 항목 */}
        {items.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">확인 · 작업한 곳</h2>
            {items.map((it) => {
              const rb = resultBadge(it.result)
              return (
                <article key={it.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-2.5 break-inside-avoid">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{it.space || '현장'}</span>
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      {RESOLUTION_LABEL[it.resolution]}
                    </span>
                  </div>
                  {it.problem && (
                    <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{it.problem}</p>
                  )}
                  {(it.beforeUrl || it.afterUrl) && (
                    <div className="grid grid-cols-2 gap-2">
                      {it.beforeUrl && (
                        <figure className="space-y-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={it.beforeUrl} alt="작업 전" className="w-full h-32 object-cover rounded-lg border border-gray-100" />
                          <figcaption className="text-center text-xs text-gray-400">작업 전</figcaption>
                        </figure>
                      )}
                      {it.afterUrl && (
                        <figure className="space-y-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={it.afterUrl} alt="작업 후" className="w-full h-32 object-cover rounded-lg border border-emerald-100" />
                          <figcaption className="text-center text-xs text-emerald-600">작업 후</figcaption>
                        </figure>
                      )}
                    </div>
                  )}
                  {rb && (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${rb.cls}`}>
                      <rb.Icon className="h-3.5 w-3.5" />{rb.label}
                    </span>
                  )}
                  {it.nextAction && (
                    <p className="text-xs text-gray-500">다음 제안 · {it.nextAction}</p>
                  )}
                </article>
              )
            })}
          </section>
        )}

        {/* 관리 멘트 */}
        {report.management_note && (
          <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm break-inside-avoid space-y-2">
            <h2 className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              앞으로 이렇게 관리하겠습니다
            </h2>
            <p className="text-sm leading-relaxed text-emerald-900/90 whitespace-pre-wrap">{report.management_note}</p>
          </section>
        )}

        {/* 푸터 */}
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
