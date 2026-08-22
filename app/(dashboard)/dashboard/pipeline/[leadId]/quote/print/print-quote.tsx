'use client'

import { useEffect, useState } from 'react'
import { formatAreaWithBoth } from '@/lib/utils/area'
import { buildStandardContractText } from '@/lib/contract/standard-contract'
import { toMarketYmd } from '@/lib/format/datetime'
import { billingMonthLabel, shiftMonth, toBillingMonth } from '@/lib/quote/invoice'
import { QuoteItemsTable } from './quote-items'
import { InvoiceDoc } from './invoice-doc'
import { buildQuoteDocTitle } from './quote-doc-title'
import type { QuoteDocKind } from './quote-doc-title'
import type { Business, Lead, Quote, QuoteItem } from './quote-doc-types'

// both = 견적서+시방서 함께 / quote = 견적서만 / spec = 시방서만
// contract = 계약서만(사장님 전용) / invoice = 청구서만
type DocMode = QuoteDocKind

interface Props {
  lead: Lead
  quote: Quote
  business: Business | null
  // 'internal' = 사장님 미리보기(링크 복사·닫기 있음) / 'public' = 고객 공개(조회 추적)
  variant?: 'internal' | 'public'
  // 조회 추적(고객 열람 알림)만 끄는 스위치 — 사장님이 공개 페이지로 자기 미리보기 할 때 사용.
  // (variant는 'public' 그대로 두어 고객 페이지와 렌더를 100% 동일하게 유지 → 인쇄 동작도 동일)
  disableTracking?: boolean
  // 공개 링크 토큰 — 링크 복사·공개 조회 추적에 사용
  publicToken?: string | null
  // 처음 보여줄 문서 (공개 링크의 ?doc= 로 지정 가능)
  initialMode?: DocMode
  // 오늘 날짜(KST 'YYYY-MM-DD') — 서버에서 계산해 내려준다(Vercel은 UTC라 서버·화면 날짜가 어긋날 수 있음)
  today?: string
  // 청구 대상 월 'YYYY-MM' (공개 링크의 ?m= 로 지정). 없으면 이번 달
  initialBillingMonth?: string
}

// 발행일/작성일 — 견적 저장일(created_at)을 KST로 표시. 저장값이 없으면 오늘 날짜로 폴백.
// (예전엔 항상 렌더 시점 new Date()라 재열람할 때마다 날짜가 바뀌었고, 시방서 작성일이 견적서와 어긋났음)
// 컴포넌트 밖에 두는 이유: 안에 두면 리액트가 "렌더할 때마다 값이 달라진다"고 경고한다.
function formatIssueDate(createdAt: string | null | undefined) {
  return new Date(createdAt ?? Date.now()).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul',
  })
}

export function PrintQuote({ lead, quote, business, variant = 'internal', disableTracking = false, publicToken, initialMode = 'both', today, initialBillingMonth }: Props) {
  const items = (Array.isArray(quote.items) ? quote.items : []) as QuoteItem[]
  const isOneOff = quote.job_type === 'one_off'

  // 정기계약은 '횟수'를 곱하지 않음 — 월 4회 35만원이면 라인 금액은 35만원(월 정액).
  // 일회성만 수량×단가로 계산.
  const lineTotal = (it: QuoteItem) => (isOneOff ? it.qty * it.unit_price : it.unit_price)
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0)
  // 할인은 소계에서 차감(소계 상한). 할인율=소계×%(원단위 내림), 정액=입력액.
  const discountValue = quote.discount_value ?? 0
  const discountAmount = quote.discount_type === 'rate'
    ? Math.min(subtotal, Math.floor(subtotal * (discountValue / 100)))
    : quote.discount_type === 'amount'
      ? Math.min(subtotal, discountValue)
      : 0
  const taxable = subtotal - discountAmount
  const tax = quote.tax_included ? Math.floor(taxable * 0.1) : 0
  const total = taxable + tax

  // 일회성 단위 라벨 (식→수량 등). 정기는 항상 '횟수'
  const UNIT_COUNT_LABEL: Record<string, string> = {
    월: '개월', 개월: '개월', 주: '주', 일: '일', 년: '년', 회: '횟수', 차: '횟수', 번: '횟수',
  }
  const countLabel = isOneOff ? (UNIT_COUNT_LABEL[(items[0]?.unit ?? '').trim()] ?? '수량') : '횟수'

  // 금액 입력 방식 — 저장값(amount_mode) 우선. 없으면(옛 견적) 모든 수량이 1인지로 추정.
  // 항목별(itemized)이면 횟수/수량 열을 항상 표시(정기 '주 1회'도 보이도록), 총액(lump)이면 숨김.
  const inferredLump = items.length > 0 && items.every((it) => (it.qty ?? 1) === 1)
  const isLumpQuote = quote.amount_mode === 'lump' || (quote.amount_mode == null && inferredLump)
  const isItemized = !isLumpQuote
  const showCountCol = isItemized
  // 단가 열은 일회성 항목별일 때만 (정기는 횟수를 곱하지 않아 금액=단가라 중복)
  const showUnitPriceCol = isOneOff && isItemized

  const hasSpec = !!quote.spec_content
  // 사장님이 보는 화면인가 — 내부 미리보기(대시보드) 또는 공개 페이지의 본인 미리보기(?preview=1)
  const isOwnerView = variant === 'internal' || disableTracking
  // 계약서 탭은 사장님 전용(내부·미리보기) + '표준 계약서 불러오기'로 저장한 계약서가 있을 때만 노출.
  // (아직 안 불러온 견적서엔 계약서 탭/자동 초안이 뜨지 않게 함)
  const canContract = isOwnerView && !!quote.contract_content?.trim()
  // 청구서 탭은 사장님에게 항상 보이고, 고객에겐 사장님이 청구서 링크(?doc=invoice)를 보냈을 때만 보인다.
  // (아직 견적 단계인 거래처가 견적서를 열었다가 '청구서'를 발견하면 벌써 돈을 내라는 줄 안다)
  const canInvoice = isOwnerView || initialMode === 'invoice'
  // 처음 보여줄 문서 — 시방서·청구서를 지정(?doc=)했으면 그것, 그 외엔 견적서. ('둘 다'는 폐지)
  const [mode, setMode] = useState<DocMode>(
    initialMode === 'spec' && hasSpec ? 'spec' : initialMode === 'invoice' ? 'invoice' : 'quote',
  )
  const [copied, setCopied] = useState(false)

  // 청구일(오늘) — 서버가 계산한 KST 날짜 우선. 없으면 화면에서 KST로 계산.
  const issuedYmd = today ?? toMarketYmd()
  // 청구 대상 월 — 정기는 매달 한 장씩 나가므로 사장님이 앞뒤 달로 옮길 수 있다(지난달치 뒤늦은 청구)
  const [billingMonth, setBillingMonth] = useState(initialBillingMonth ?? toBillingMonth(issuedYmd))

  const showQuote = mode === 'both' || mode === 'quote'
  const showSpec = hasSpec && (mode === 'both' || mode === 'spec')
  const showContract = mode === 'contract'
  const showInvoice = mode === 'invoice'

  // 문서 선택 토글 옵션 (있는 문서만 노출) — 실제 진행 순서대로 놓는다
  const modeOptions: [DocMode, string][] = [
    ['quote', '견적서'],
    ...(hasSpec ? ([['spec', '시방서']] as [DocMode, string][]) : []),
    ...(canContract ? ([['contract', '계약서']] as [DocMode, string][]) : []),
    ...(canInvoice ? ([['invoice', '청구서']] as [DocMode, string][]) : []),
  ]

  const issueDate = formatIssueDate(quote.created_at)

  // 계약서 본문 — 사장님이 편집해 저장한 텍스트 우선, 없으면 견적 데이터로 표준 문안 즉석 생성
  const contractBody = quote.contract_content?.trim()
    ? quote.contract_content
    : buildStandardContractText({
        clientCompany: lead.company_name,
        businessName: business?.legal_name || business?.name || null,
        isOneOff,
        total,
        taxIncluded: quote.tax_included,
        frequency: quote.frequency,
        workerCount: quote.worker_count,
        siteName: quote.site_name,
        siteAddress: quote.site_address,
        conditions: quote.conditions,
      })

  // PDF 파일명 — 브라우저는 '문서 제목'을 그대로 저장 파일명으로 쓴다.
  // '견적서·시방서'로 고정해두면 거래처마다 받은 파일이 전부 같은 이름이라 나중에 누구 것인지 못 찾고,
  // 지금 보고 있는 문서가 청구서여도 파일명은 견적서로 남는다. → '한빛치과 청구서'처럼 붙인다.
  //
  // ⚠️ 예전에 인쇄 직전 제목이 '무제'로 깜빡인 사고가 있었다. 원인은 제목을 되돌리는 정리(cleanup)였다.
  //    여기선 되돌리지 않는다(값만 덮어씀). 정리 코드를 다시 넣지 말 것.
  const docTitle = buildQuoteDocTitle(lead.company_name, mode)
  useEffect(() => {
    document.title = docTitle
  }, [docTitle])

  // 공개 링크로 고객이 열람하면 조회 기록 → 재열람 시 대표에게 알림
  useEffect(() => {
    if (variant !== 'public' || disableTracking || !publicToken) return
    try {
      const payload = JSON.stringify({ token: publicToken })
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon('/api/track/b2b-quote-view', blob)
    } catch {
      // 추적 실패가 고객 열람을 막지 않도록 무시
    }
  }, [variant, disableTracking, publicToken])

  const handleCopyLink = async () => {
    if (!publicToken) return
    const base = `${window.location.origin}/quote/${publicToken}`
    // 특정 문서만 보내고 싶으면 ?doc= 를 붙임 (둘 다는 파라미터 없음)
    // 정기 청구서는 어느 달치인지까지 링크에 담아야 고객 화면에도 같은 달이 뜬다
    const url = mode === 'both'
      ? base
      : mode === 'invoice' && !isOneOff
        ? `${base}?doc=invoice&m=${billingMonth}`
        : `${base}?doc=${mode}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('아래 링크를 복사해서 고객에게 보내세요', url)
    }
  }

  return (
    <>
      {/* 인쇄할 때 브라우저가 종이 가장자리에 찍는 머리글·바닥글을 없앤다.
          (상단 '26. 8. 20. 오후 6:11 · 견적서·시방서', 하단 'https://qualio.co.kr/quote/… 1/1')
          거래처에 보내는 서류에 그런 게 찍히면 인쇄물이 아니라 화면 캡처처럼 보인다.

          ⚠️ 이건 우리가 그린 게 아니라 브라우저 인쇄 기능이 넣는 것이라 HTML로는 못 지운다.
             종이 여백(@page margin)을 0으로 만들어 찍힐 자리 자체를 없애는 게 유일한 방법이다.
             대신 본문이 가장자리에 붙으므로 여백은 문서 안쪽 padding(print:p-[15mm])이 담당한다. */}
      <style>{`@page { size: A4; margin: 0; }`}</style>

      {/* 상단 툴바 (화면에서만 보임, 인쇄 시 숨김)
          모바일: 화면 폭을 꽉 채우는 고정 막대 — 예전엔 fixed 로 떠 있어 견적서 제목을 가렸다.
          데스크탑(sm~): 기존처럼 문서 위에 떠 있는 버튼 묶음. */}
      <div className="print:hidden sticky top-0 z-50 flex flex-wrap items-center justify-end gap-2 border-b bg-white/95 px-3 py-2 backdrop-blur sm:fixed sm:top-4 sm:right-4 sm:left-auto sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none sm:max-w-[calc(100vw-2rem)]">
        {/* 문서 선택 토글 */}
        {modeOptions.length > 1 && (
          <div className="flex rounded-lg border bg-white shadow-lg overflow-hidden text-sm font-medium">
            {modeOptions.map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 transition-colors ${mode === m ? 'bg-primary text-primary-foreground' : 'text-gray-600 hover:bg-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 청구 대상 월 — 정기계약은 매달 청구서가 한 장씩 나간다.
            (달이 바뀌자마자 '지난달치'를 청구하는 일이 많아 앞뒤로 옮길 수 있어야 함) */}
        {showInvoice && !isOneOff && isOwnerView && (
          <div className="flex items-center rounded-lg border bg-white shadow-lg overflow-hidden text-sm font-medium">
            <button
              onClick={() => setBillingMonth((m) => shiftMonth(m, -1))}
              className="px-3 py-2 text-gray-600 hover:bg-muted"
              aria-label="이전 달"
            >
              ‹
            </button>
            <span className="px-2 py-2 tabular-nums">{billingMonthLabel(billingMonth)}</span>
            <button
              onClick={() => setBillingMonth((m) => shiftMonth(m, 1))}
              className="px-3 py-2 text-gray-600 hover:bg-muted"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
        )}

        {/* PDF로 저장 — 이 공개 페이지에서 window.print()가 정상 동작(고객 링크/미리보기 공통).
            (예전 백지 문제는 내부 전용 라우트/빈 탭 열기 방식 때문이었고, 이 페이지는 정상) */}
        <button
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-lg hover:bg-primary/90"
        >
          PDF로 저장
        </button>

        {variant === 'internal' && publicToken && !showContract && (
          <button
            onClick={handleCopyLink}
            className="bg-white border px-4 py-2 rounded-lg text-sm font-medium shadow-lg hover:bg-muted"
          >
            {copied ? '✓ 복사됐어요' : '고객 링크 복사'}
          </button>
        )}

        {variant === 'internal' && (
          <button
            onClick={() => window.close()}
            className="bg-white border px-4 py-2 rounded-lg text-sm font-medium shadow-lg hover:bg-muted"
          >
            닫기
          </button>
        )}
      </div>

      {/* 문서 본문
          A4(210mm) 종이를 그대로 폰에 넣으면 화면보다 2배 넓어 확대·잘림이 생긴다.
          모바일은 종이 흉내를 버리고 여백 16px의 일반 문서로, sm~ 와 인쇄는 기존 A4 그대로. */}
      <div className="max-w-[210mm] mx-auto bg-white px-4 py-6 text-[15px] leading-relaxed sm:p-[20mm] sm:text-[14px] print:p-[15mm] print:max-w-none print:text-[14px] font-sans">

        {/* ── 견적서 ─────────────────────────────── */}
        {showQuote && (
        <div className="mb-12 print:mb-10">

          {/* 헤더 */}
          <div className="flex flex-col gap-2 border-b-2 border-gray-800 pb-4 mb-6 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between print:gap-0">
            <div>
              <h1 className="text-2xl sm:text-3xl print:text-3xl font-bold tracking-tight">견 적 서</h1>
              <p className="text-sm text-gray-500 mt-1">ESTIMATE</p>
            </div>
            <div className="text-sm text-gray-600 space-y-0.5 sm:text-right print:text-right">
              {quote.quote_number && <p>견적번호: <span className="font-medium text-gray-900">{quote.quote_number}</span></p>}
              <p>발행일: <span className="font-medium text-gray-900">{issueDate}</span></p>
              {quote.valid_until && (
                <p>유효기간: <span className="font-medium text-gray-900">
                  {new Date(quote.valid_until).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span></p>
              )}
            </div>
          </div>

          {/* 수신 / 공급자 */}
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
              <p className="font-bold text-lg">{business?.name ?? '업체명'}</p>
              {business?.phone && <p className="text-sm text-gray-600">연락처: {business.phone}</p>}
              {business?.address && <p className="text-sm text-gray-600">주소: {business.address}</p>}
            </div>
          </div>

          {/* 견적 항목 — 청구서와 같은 표를 쓴다 */}
          <QuoteItemsTable
            items={items}
            countLabel={countLabel}
            showCountCol={showCountCol}
            showUnitPriceCol={showUnitPriceCol}
            lineTotal={lineTotal}
          />

          {/* 합계 */}
          <div className="flex justify-end">
            {/* 모바일은 합계가 주인공이라 폭을 꽉 채우고 글자를 키운다 */}
            <div className="w-full space-y-1.5 text-sm sm:w-64 print:w-64">
              <div className="flex justify-between py-1">
                <span className="text-gray-600">소 계</span>
                <span className="tabular-nums">{subtotal.toLocaleString()}원</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">
                    할인{quote.discount_type === 'rate' ? ` (${discountValue}%)` : ''}
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
              <div className="flex justify-between py-2 border-t-2 border-gray-800 font-bold text-lg sm:text-base print:text-base">
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
        )}

        {/* ── 시방서 (둘 다 보기일 때만 페이지 구분) ─────────────────────── */}
        {showSpec && (
          <div className={mode === 'both' ? 'print:break-before-page' : ''}>
            <div className="border-b-2 border-gray-800 pb-4 mb-6">
              <h1 className="text-2xl sm:text-3xl print:text-3xl font-bold tracking-tight">시 방 서</h1>
              <p className="text-sm text-gray-500 mt-1">SPECIFICATION</p>
            </div>

            {/* 현장 정보 */}
            {(quote.site_name || quote.site_address || quote.site_area || quote.frequency) && (
              <div className="grid grid-cols-1 gap-4 mb-6 text-sm border rounded-lg p-4 sm:grid-cols-2 sm:mb-8 print:grid-cols-2 print:mb-8">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">현장 정보</p>
                  {quote.site_name && <p><span className="text-gray-500">현장명:</span> <span className="font-medium">{quote.site_name}</span></p>}
                  {quote.site_address && <p><span className="text-gray-500">주소:</span> {quote.site_address}</p>}
                  {quote.site_area && <p><span className="text-gray-500">면적:</span> {formatAreaWithBoth(quote.site_area)}</p>}
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

            {/* 서명란 — 디지털 발송이 많아 '대표자 (인)' 도장 자리는 두지 않고 작성일·업체명만 표기 */}
            <div className="mt-16 flex justify-end">
              <div className="text-center space-y-1">
                <p className="text-sm text-gray-600">{issueDate}</p>
                <p className="font-bold text-base">{business?.name ?? '업체명'}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── 청구서 (견적서와 같은 항목·금액으로 만드는 대금 청구 서류) ─────── */}
        {showInvoice && (
          <InvoiceDoc
            lead={lead}
            business={business}
            quote={quote}
            items={items}
            isOneOff={isOneOff}
            countLabel={countLabel}
            showCountCol={showCountCol}
            showUnitPriceCol={showUnitPriceCol}
            lineTotal={lineTotal}
            subtotal={subtotal}
            discountAmount={discountAmount}
            tax={tax}
            total={total}
            issuedYmd={issuedYmd}
            billingMonth={billingMonth}
            isOwnerView={isOwnerView}
          />
        )}

        {/* ── 계약서 (사장님 전용, 고객 링크엔 비노출) ─────────────────────── */}
        {showContract && (
          <div>
            {/* 헤더 */}
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-8">
              <h1 className="text-2xl sm:text-3xl print:text-3xl font-bold tracking-tight">용역(청소) 계약서</h1>
              <p className="text-sm text-gray-500 mt-1">SERVICE AGREEMENT</p>
            </div>

            {/* 본문 — 사장님이 편집한 텍스트(또는 표준 문안)를 그대로 표시 */}
            <div className="text-sm leading-7 whitespace-pre-wrap text-gray-800">{contractBody}</div>

            {/* 마무리 문구 + 계약일(공란 — 서명 시 직접 기입) */}
            <p className="text-center text-sm text-gray-700 mt-10 mb-3">
              본 계약을 증명하기 위하여 계약서 2부를 작성하여 “갑”과 “을”이 서명·날인 후 각 1부씩 보관한다.
            </p>
            <p className="text-center text-sm text-gray-600 mb-10">
              계약일:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일
            </p>

            {/* 서명란 */}
            <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2 sm:gap-8 print:grid-cols-2 print:gap-8">
              <div className="space-y-1.5">
                <p className="font-semibold text-gray-700 border-b pb-1 mb-2">“갑” (발주자)</p>
                <p>상호: {lead.company_name}</p>
                <p>주소: {lead.address ?? '_______________'}</p>
                <p>대표: {lead.contact_name ?? '_______________'}</p>
                <p className="pt-4">(서명 또는 인) ______________</p>
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold text-gray-700 border-b pb-1 mb-2">“을” (수급자)</p>
                <p>상호: {business?.legal_name || business?.name || '_______________'}</p>
                {business?.business_number && <p>사업자등록번호: {business.business_number}</p>}
                <p>주소: {business?.address ?? '_______________'}</p>
                <p>대표: {business?.owner_name ?? '_______________'}</p>
                {business?.payment_account && <p>입금 계좌: {business.payment_account}</p>}
                <p className="pt-4">(서명 또는 인) ______________</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
