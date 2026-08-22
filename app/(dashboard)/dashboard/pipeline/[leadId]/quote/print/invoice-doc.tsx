import { formatDate } from '@/lib/format/datetime'
import { formatMoney } from '@/lib/format/money'
import { billingMonthLabel, buildInvoiceNumber, invoiceDueYmd } from '@/lib/quote/invoice'
import { QuoteItemsTable } from './quote-items'
import type { Business, Lead, Quote, QuoteItem } from './quote-doc-types'

// 청구서 — 견적서와 같은 자료(항목·금액)로 만드는 '대금 청구' 서류.
//
// 왜 견적서와 따로 두나: 견적서는 "이 금액이면 됩니다"(제안), 청구서는 "이 금액을 이 계좌로
// 이 날짜까지 넣어주세요"(요청)다. 법인 거래처의 경리 담당자가 지출 결의에 그대로 올리는 서류라
// 청구번호·청구 대상·입금 계좌·입금 기한이 한 장에 다 있어야 한다.
//
// 금액 계산은 견적서와 100% 같은 값을 그대로 받는다(다시 계산하지 않는다).
// 두 문서의 금액이 1원이라도 다르면 거래처는 어느 쪽을 믿어야 할지 모른다.

interface Props {
  lead: Lead
  business: Business | null
  quote: Quote
  items: QuoteItem[]
  isOneOff: boolean
  countLabel: string
  showCountCol: boolean
  showUnitPriceCol: boolean
  lineTotal: (item: QuoteItem) => number
  subtotal: number
  discountAmount: number
  tax: number
  total: number
  /** 청구일 (KST 'YYYY-MM-DD') */
  issuedYmd: string
  /** 청구 대상 월 'YYYY-MM' — 정기계약만 표시 */
  billingMonth: string
  /** 사장님이 보는 화면인가 — 계좌 미등록 안내는 여기서만 띄운다 */
  isOwnerView: boolean
}

export function InvoiceDoc({
  lead, business, quote, items, isOneOff,
  countLabel, showCountCol, showUnitPriceCol, lineTotal,
  subtotal, discountAmount, tax, total,
  issuedYmd, billingMonth, isOwnerView,
}: Props) {
  const invoiceNo = buildInvoiceNumber({
    quoteNumber: quote.quote_number,
    quoteId: quote.id ?? '',
    isOneOff,
    billingMonth,
  })
  const dueYmd = invoiceDueYmd({ issuedYmd, isOneOff, billingMonth })
  const issuedLabel = formatDate(issuedYmd)
  const dueLabel = formatDate(dueYmd)

  // 무엇에 대한 청구인지 한 줄 — 정기는 '2026년 8월분', 일회성은 작업 이름
  const subject = isOneOff
    ? (quote.site_name?.trim() || items[0]?.name?.trim() || '청소 용역')
    : billingMonthLabel(billingMonth)

  const supplierName = business?.legal_name?.trim() || business?.name || '업체명'
  const account = business?.payment_account?.trim()

  return (
    <div>
      {/* 헤더 */}
      <div className="flex flex-col gap-2 border-b-2 border-gray-800 pb-4 mb-6 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between print:gap-0">
        <div>
          <h1 className="text-2xl sm:text-3xl print:text-3xl font-bold tracking-tight">청 구 서</h1>
          <p className="text-sm text-gray-500 mt-1">INVOICE</p>
        </div>
        <div className="text-sm text-gray-600 space-y-0.5 sm:text-right print:text-right">
          <p>청구번호: <span className="font-medium text-gray-900">{invoiceNo}</span></p>
          <p>청구일: <span className="font-medium text-gray-900">{issuedLabel}</span></p>
          <p>입금 기한: <span className="font-medium text-gray-900">{dueLabel}</span></p>
        </div>
      </div>

      {/* 수신 / 공급자 — 견적서와 같은 구조. 청구서는 경리가 처리하므로 사업자등록번호까지 넣는다 */}
      <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-2 sm:gap-8 sm:mb-8 print:grid-cols-2 print:gap-8 print:mb-8">
        <div className="border rounded-lg p-4 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">수 신</p>
          <p className="font-bold text-lg">{lead.company_name} 귀중</p>
          {lead.contact_name && <p className="text-sm text-gray-600">담당자: {lead.contact_name}</p>}
          {lead.phone && <p className="text-sm text-gray-600">연락처: {lead.phone}</p>}
          {lead.address && <p className="text-sm text-gray-600">주소: {lead.address}</p>}
        </div>
        <div className="border rounded-lg p-4 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">공 급 자</p>
          <p className="font-bold text-lg">{supplierName}</p>
          {business?.business_number && <p className="text-sm text-gray-600">사업자등록번호: {business.business_number}</p>}
          {business?.owner_name && <p className="text-sm text-gray-600">대표: {business.owner_name}</p>}
          {business?.phone && <p className="text-sm text-gray-600">연락처: {business.phone}</p>}
          {business?.address && <p className="text-sm text-gray-600">주소: {business.address}</p>}
        </div>
      </div>

      {/* 무엇에 대한 청구인지 */}
      <div className="mb-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-l-4 border-gray-800 pl-3">
        <span className="text-xs font-semibold text-gray-500">청구 대상</span>
        <span className="text-base font-bold">{subject}</span>
        {quote.site_name && !isOneOff && <span className="text-sm text-gray-600">· {quote.site_name}</span>}
        {quote.site_address && <span className="text-sm text-gray-600">· {quote.site_address}</span>}
      </div>

      {/* 청구 내역 — 견적서와 같은 표 */}
      <QuoteItemsTable
        items={items}
        countLabel={countLabel}
        showCountCol={showCountCol}
        showUnitPriceCol={showUnitPriceCol}
        lineTotal={lineTotal}
      />

      {/* 합계 — 견적서와 같은 순서(소계 · 할인 · 부가세) */}
      <div className="flex justify-end">
        <div className="w-full space-y-1.5 text-sm sm:w-64 print:w-64">
          <div className="flex justify-between py-1">
            <span className="text-gray-600">소 계</span>
            <span className="tabular-nums">{subtotal.toLocaleString()}원</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-gray-600">
                할인{quote.discount_type === 'rate' ? ` (${quote.discount_value ?? 0}%)` : ''}
              </span>
              <span className="tabular-nums">− {discountAmount.toLocaleString()}원</span>
            </div>
          )}
          {quote.tax_included && (
            <div className="flex justify-between py-1">
              <span className="text-gray-600">부가세 (10%)</span>
              <span className="tabular-nums">{tax.toLocaleString()}원</span>
            </div>
          )}
        </div>
      </div>

      {/* 청구 금액 — 이 문서의 결론이라 유일하게 크게 쓴다 */}
      <div className="mt-4 border-y-2 border-gray-800 py-4 flex items-end justify-between gap-4">
        <span className="text-sm font-semibold text-gray-600">청구 금액</span>
        <div className="text-right">
          <p className="text-2xl sm:text-[28px] print:text-[28px] leading-none font-bold tabular-nums">
            {formatMoney(total)}
          </p>
          {!quote.tax_included && <p className="text-xs text-gray-500 mt-1.5">부가세 별도</p>}
        </div>
      </div>

      {/* 입금 계좌 — 청구서의 핵심. 설정 > 사업자 정보의 '정산(입금) 계좌'를 그대로 쓴다 */}
      {account ? (
        <div className="mt-6 border-2 border-gray-800 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">입금 계좌</p>
          <p className="text-base font-bold break-keep">{account}</p>
          <p className="text-sm text-gray-600 mt-1.5">
            {dueLabel}까지 위 계좌로 입금해 주세요.
          </p>
        </div>
      ) : isOwnerView ? (
        // 계좌가 비어 있으면 청구서가 무용지물이라 사장님에게만 알린다(인쇄물엔 안 나감)
        <div className="mt-6 rounded-lg border-2 border-red-300 bg-red-50 p-4 print:hidden">
          <p className="text-sm font-bold text-red-700">입금 계좌가 아직 등록되지 않았어요</p>
          <p className="text-sm text-red-700 mt-1">
            설정 &gt; 사업자 정보의 &lsquo;정산(입금) 계좌&rsquo;를 채우면 이 자리에 자동으로 들어가요.
            지금 보내면 거래처가 어디로 입금할지 몰라요.
          </p>
        </div>
      ) : null}

      {/* 안내 한 줄 */}
      <p className="text-xs text-gray-500 mt-4 leading-6">
        입금자명이 상호와 다르면 미리 알려주시면 확인이 빠릅니다.
        {business?.phone && <> 문의 {business.phone}</>}
      </p>

      {/* 특이사항 — 견적서에 적어둔 계약 조건을 그대로 옮긴다(청구서만 따로 읽어도 조건을 알 수 있게) */}
      {quote.conditions && (
        <div className="mt-6 border rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">계약 조건 및 특이사항</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.conditions}</p>
        </div>
      )}

      {/* 발행란 — 시방서와 같은 모양(작성일 + 업체명) */}
      <div className="mt-16 flex justify-end">
        <div className="text-center space-y-1">
          <p className="text-sm text-gray-600">{issuedLabel}</p>
          <p className="font-bold text-base">{supplierName}</p>
        </div>
      </div>
    </div>
  )
}
