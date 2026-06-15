'use client'

import { useEffect } from 'react'

interface QuoteItem {
  name: string
  unit: string
  qty: number
  unit_price: number
}

interface Lead {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  address: string | null
}

interface Quote {
  quote_number: string | null
  valid_until: string | null
  items: unknown
  total_amount: number
  tax_included: boolean
  conditions: string | null
  site_name: string | null
  site_address: string | null
  site_area: string | null
  frequency: string | null
  worker_count: number | null
  spec_content: string | null
}

interface Business {
  name: string
  phone: string | null
  address: string | null
}

interface Props {
  lead: Lead
  quote: Quote
  business: Business | null
}

export function PrintQuote({ lead, quote, business }: Props) {
  const items = (Array.isArray(quote.items) ? quote.items : []) as QuoteItem[]
  const subtotal = items.reduce((s, it) => s + it.qty * it.unit_price, 0)
  const tax = quote.tax_included ? Math.floor(subtotal * 0.1) : 0
  const total = subtotal + tax

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  useEffect(() => {
    document.title = `견적서_${lead.company_name}_${quote.quote_number ?? ''}`
  }, [lead.company_name, quote.quote_number])

  return (
    <>
      {/* 인쇄 버튼 (화면에서만 보임) */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-lg hover:bg-primary/90"
        >
          PDF로 저장
        </button>
        <button
          onClick={() => window.close()}
          className="bg-white border px-4 py-2 rounded-lg text-sm font-medium shadow-lg hover:bg-muted"
        >
          닫기
        </button>
      </div>

      <div className="max-w-[210mm] mx-auto bg-white p-[20mm] text-[14px] leading-relaxed print:p-[15mm] print:max-w-none font-sans">

        {/* ── 견적서 ─────────────────────────────── */}
        <div className="mb-12 print:mb-10">

          {/* 헤더 */}
          <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">견 적 서</h1>
              <p className="text-sm text-gray-500 mt-1">ESTIMATE</p>
            </div>
            <div className="text-right text-sm text-gray-600 space-y-0.5">
              {quote.quote_number && <p>견적번호: <span className="font-medium text-gray-900">{quote.quote_number}</span></p>}
              <p>발행일: <span className="font-medium text-gray-900">{today}</span></p>
              {quote.valid_until && (
                <p>유효기간: <span className="font-medium text-gray-900">
                  {new Date(quote.valid_until).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span></p>
              )}
            </div>
          </div>

          {/* 수신 / 공급자 */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className="border rounded-lg p-4 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">수 신</p>
              <p className="font-bold text-lg">{lead.company_name} 귀중</p>
              {lead.contact_name && <p className="text-sm text-gray-600">담당자: {lead.contact_name}</p>}
              {lead.phone && <p className="text-sm text-gray-600">연락처: {lead.phone}</p>}
              {lead.address && <p className="text-sm text-gray-600">주소: {lead.address}</p>}
            </div>
            <div className="border rounded-lg p-4 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">공 급 자</p>
              <p className="font-bold text-lg">{business?.name ?? '업체명'}</p>
              {business?.phone && <p className="text-sm text-gray-600">연락처: {business.phone}</p>}
              {business?.address && <p className="text-sm text-gray-600">주소: {business.address}</p>}
            </div>
          </div>

          {/* 견적 항목 표 */}
          <table className="w-full border-collapse mb-6 text-sm">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="py-2.5 px-3 text-left font-medium w-8">No.</th>
                <th className="py-2.5 px-3 text-left font-medium">서비스 내용</th>
                <th className="py-2.5 px-3 text-center font-medium w-16">단위</th>
                <th className="py-2.5 px-3 text-center font-medium w-16">수량</th>
                <th className="py-2.5 px-3 text-right font-medium w-28">단가</th>
                <th className="py-2.5 px-3 text-right font-medium w-28">금액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-2.5 px-3 text-gray-500">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-medium">{item.name}</td>
                  <td className="py-2.5 px-3 text-center text-gray-600">{item.unit}</td>
                  <td className="py-2.5 px-3 text-center">{item.qty}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{item.unit_price.toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-medium">{(item.qty * item.unit_price).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 합계 */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-gray-600">소 계</span>
                <span className="tabular-nums">{subtotal.toLocaleString()}원</span>
              </div>
              {quote.tax_included && (
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">부가세 (10%)</span>
                  <span className="tabular-nums">{tax.toLocaleString()}원</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t-2 border-gray-800 font-bold text-base">
                <span>합 계</span>
                <span className="tabular-nums">{total.toLocaleString()}원</span>
              </div>
              {!quote.tax_included && (
                <p className="text-xs text-gray-500 text-right">* 부가세 별도</p>
              )}
            </div>
          </div>

          {/* 특이사항 */}
          {quote.conditions && (
            <div className="mt-6 border rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">계약 조건 및 특이사항</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.conditions}</p>
            </div>
          )}
        </div>

        {/* ── 시방서 (페이지 구분) ─────────────────────── */}
        {quote.spec_content && (
          <div className="print:break-before-page">
            <div className="border-b-2 border-gray-800 pb-4 mb-6">
              <h1 className="text-3xl font-bold tracking-tight">시 방 서</h1>
              <p className="text-sm text-gray-500 mt-1">SPECIFICATION</p>
            </div>

            {/* 현장 정보 */}
            {(quote.site_name || quote.site_address || quote.site_area || quote.frequency) && (
              <div className="grid grid-cols-2 gap-4 mb-8 text-sm border rounded-lg p-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">현장 정보</p>
                  {quote.site_name && <p><span className="text-gray-500">현장명:</span> <span className="font-medium">{quote.site_name}</span></p>}
                  {quote.site_address && <p><span className="text-gray-500">주소:</span> {quote.site_address}</p>}
                  {quote.site_area && <p><span className="text-gray-500">면적:</span> {quote.site_area}</p>}
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">작업 계획</p>
                  {quote.frequency && <p><span className="text-gray-500">청소 주기:</span> <span className="font-medium">{quote.frequency}</span></p>}
                  {quote.worker_count && <p><span className="text-gray-500">투입 인원:</span> <span className="font-medium">{quote.worker_count}명</span></p>}
                </div>
              </div>
            )}

            {/* 시방서 본문 */}
            <div className="text-sm leading-7 whitespace-pre-wrap text-gray-800">
              {quote.spec_content}
            </div>

            {/* 서명란 */}
            <div className="mt-16 flex justify-end">
              <div className="text-center space-y-2">
                <p className="text-sm text-gray-600">{today}</p>
                <p className="font-bold text-base">{business?.name ?? '업체명'}</p>
                <div className="border-t border-gray-400 mt-8 pt-2 w-40 text-xs text-gray-500">대표자 (인)</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
