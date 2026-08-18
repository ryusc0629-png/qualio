import type { ReactNode } from 'react'

// 고객·거래처에 나가는 문서의 공통 틀.
//
// 왜 한 곳에 모으나:
// 초도 리포트·작업 보고서·월간 보고서·영수증은 한 업체가 같은 거래처에 보내는 서류다.
// 결이 다르면 "이 업체가 만든 문서"가 아니라 "어떤 서비스가 뱉어낸 화면"으로 읽힌다.
// 특히 법인 담당자가 위에 올릴 때 그게 그대로 드러난다.
//
// 톤: 플랫폼 화면이 아니라 서류. 색은 절제하고(에메랄드는 포인트로만),
// 구분은 색 대신 선으로. 화면에선 종이 한 장처럼, 인쇄하면 A4.
//
// ⚠️ 새 고객용 문서를 만들면 여기 조각을 쓸 것. 페이지마다 새 스타일을 만들면
//    다시 제각각이 된다.

/** 문서 한 장 — 회색 바탕 위의 흰 종이 */
export function DocPage({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 py-6 px-3 print:bg-white print:p-0 [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
      <div className="mx-auto max-w-[860px] print:max-w-none">
        {action && <div className="flex justify-end mb-3 print:hidden">{action}</div>}
        <article className="bg-white shadow-sm ring-1 ring-slate-200 px-6 py-8 sm:px-12 sm:py-12 print:shadow-none print:ring-0 print:px-0 print:py-0">
          {children}
        </article>
      </div>
    </main>
  )
}

/** 문서 머리 — 왼쪽 업체, 오른쪽 문서 이름·번호 */
export function DocHeader({
  businessName,
  businessPhone,
  title,
  docNo,
}: {
  businessName: string
  businessPhone?: string | null
  title: string
  docNo?: string | null
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b-4 border-slate-900 pb-4">
      <div className="min-w-0">
        <p className="text-base font-bold tracking-tight text-slate-900">{businessName}</p>
        {businessPhone && (
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{businessPhone}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-[-0.02em] text-slate-900">{title}</h1>
        {docNo && <p className="text-[10px] tracking-widest text-slate-400 mt-1 tabular-nums">{docNo}</p>}
      </div>
    </header>
  )
}

/** 발행 정보 표 — 거래처·현장·일시 같은 머리말 항목 */
export function DocMeta({ items }: { items: Array<{ k: string; v: string }> }) {
  const rows = items.filter((m) => m.v)
  if (rows.length === 0) return null

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 border-b border-slate-200">
      {rows.map((m) => (
        <div
          key={m.k}
          className="flex gap-3 py-2.5 border-b border-slate-100 last:border-0 sm:[&:nth-last-child(-n+2)]:border-0"
        >
          <dt className="w-16 shrink-0 text-[11px] font-semibold text-slate-500 pt-px">{m.k}</dt>
          <dd className="text-[13px] text-slate-900 min-w-0 break-words">{m.v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 문서 첫 문단 — 받는 사람에게 건네는 한두 줄 */
export function DocLede({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-7 text-slate-700 mt-7">{children}</p>
}

/**
 * 번호 붙은 절.
 *
 * ⚠️ 번호는 '읽는 순서'가 실제로 있을 때만 쓴다(진단 → 작업 → 결과 → 계획).
 *    순서가 없는 문서(영수증 등)는 no를 비우고 제목만 쓴다.
 */
export function DocSection({
  no,
  title,
  children,
  lead,
}: {
  no?: string
  title: string
  children: ReactNode
  lead?: string
}) {
  return (
    <section className="mt-8 break-inside-avoid">
      <div className="flex items-baseline gap-2.5 border-b-2 border-slate-900 pb-1.5 mb-3">
        {no && <span className="text-[11px] font-bold tracking-widest text-emerald-600 tabular-nums">{no}</span>}
        <h2 className="text-[13px] font-bold tracking-tight text-slate-900">{title}</h2>
      </div>
      {lead && <p className="text-[12px] text-slate-500 mb-3">{lead}</p>}
      {children}
    </section>
  )
}

/** 본문 문단 — 줄바꿈 그대로 */
export function DocText({ children }: { children: string }) {
  return <p className="text-[13px] leading-7 text-slate-700 whitespace-pre-wrap">{children}</p>
}

/** 강조 블록 — 문서에서 딱 한 군데만 쓴다(관리 계획·총평 같은 결론) */
export function DocCallout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-emerald-50/70 border-l-4 border-emerald-500 px-5 py-4">
      <div className="text-[13px] leading-7 text-slate-800">{children}</div>
    </div>
  )
}

/** 항목 표 — 이름/값 두 칸짜리 줄 목록 */
export function DocRows({ items }: { items: Array<{ k: string; v: ReactNode }> }) {
  return (
    <div className="divide-y divide-slate-100 border-y border-slate-200">
      {items.map((r) => (
        <div key={r.k} className="flex items-start justify-between gap-6 py-2.5">
          <span className="text-[12px] text-slate-500 shrink-0">{r.k}</span>
          <span className="text-[13px] font-medium text-slate-900 text-right min-w-0 break-words">{r.v}</span>
        </div>
      ))}
    </div>
  )
}

/** 발행란 — 날짜 + 업체명 + (인) */
export function DocSignature({
  businessName,
  businessPhone,
  issuedLabel,
}: {
  businessName: string
  businessPhone?: string | null
  issuedLabel: string
}) {
  return (
    <footer className="mt-12 pt-5 border-t border-slate-200 break-inside-avoid">
      <p className="text-[12px] text-slate-500">{issuedLabel}</p>
      <div className="flex items-end justify-between gap-4 mt-3">
        <div>
          <p className="text-[15px] font-bold text-slate-900">{businessName}</p>
          {businessPhone && (
            <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">문의 {businessPhone}</p>
          )}
        </div>
        <span className="text-[10px] text-slate-300">(인)</span>
      </div>
    </footer>
  )
}
