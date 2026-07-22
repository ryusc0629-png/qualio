'use client'

import { useEffect, useState } from 'react'
import { formatAreaWithBoth } from '@/lib/utils/area'

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
  // 정기(recurring) / 일회성(one_off) — 횟수 열 라벨 결정에 사용
  job_type?: string | null
  // 견적 최초 저장일 — 발행일/작성일로 사용(재열람해도 바뀌지 않게 저장값 기준)
  created_at?: string | null
}

interface Business {
  name: string
  phone: string | null
  address: string | null
}

// both = 견적서+시방서 함께 / quote = 견적서만 / spec = 시방서만
type DocMode = 'both' | 'quote' | 'spec'

interface Props {
  lead: Lead
  quote: Quote
  business: Business | null
  // 'internal' = 사장님 미리보기(링크 복사·닫기 있음) / 'public' = 고객 공개(조회 추적)
  variant?: 'internal' | 'public'
  // 공개 링크 토큰 — 링크 복사·공개 조회 추적에 사용
  publicToken?: string | null
  // 처음 보여줄 문서 (공개 링크의 ?doc= 로 지정 가능)
  initialMode?: DocMode
}

export function PrintQuote({ lead, quote, business, variant = 'internal', publicToken, initialMode = 'both' }: Props) {
  const items = (Array.isArray(quote.items) ? quote.items : []) as QuoteItem[]
  const isOneOff = quote.job_type === 'one_off'

  // 정기계약은 '횟수'를 곱하지 않음 — 월 4회 35만원이면 라인 금액은 35만원(월 정액).
  // 일회성만 수량×단가로 계산.
  const lineTotal = (it: QuoteItem) => (isOneOff ? it.qty * it.unit_price : it.unit_price)
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0)
  const tax = quote.tax_included ? Math.floor(subtotal * 0.1) : 0
  const total = subtotal + tax

  // 일회성 단위 라벨 (식→수량 등). 정기는 항상 '횟수'
  const UNIT_COUNT_LABEL: Record<string, string> = {
    월: '개월', 개월: '개월', 주: '주', 일: '일', 년: '년', 회: '횟수', 차: '횟수', 번: '횟수',
  }
  const countLabel = isOneOff ? (UNIT_COUNT_LABEL[(items[0]?.unit ?? '').trim()] ?? '수량') : '횟수'

  // 일회성 총액형(모든 수량 1) — 수량·단가 열 숨기고 금액만
  const isLumpQuote = isOneOff && items.length > 0 && items.every((it) => (it.qty ?? 1) === 1)
  // 정기는 방문이 2회 이상일 때만 '횟수' 열을 정보용으로 표시(곱하지 않음)
  const showRecurringCount = !isOneOff && items.some((it) => (it.qty ?? 1) > 1)
  const showCountCol = (isOneOff && !isLumpQuote) || showRecurringCount
  const showUnitPriceCol = isOneOff && !isLumpQuote

  const hasSpec = !!quote.spec_content
  // 시방서가 없으면 견적서만 가능
  const [mode, setMode] = useState<DocMode>(hasSpec ? initialMode : 'quote')
  const [copied, setCopied] = useState(false)

  const showQuote = mode !== 'spec'
  const showSpec = hasSpec && mode !== 'quote'

  // 발행일/작성일 — 견적 저장일(created_at)을 KST로 표시. 저장값이 없으면 오늘 날짜로 폴백.
  // (예전엔 항상 렌더 시점 new Date()라 재열람할 때마다 날짜가 바뀌었고, 시방서 작성일이 견적서와 어긋났음)
  const issueDate = new Date(quote.created_at ?? Date.now()).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul',
  })

  const docLabel = mode === 'quote' ? '견적서' : mode === 'spec' ? '시방서' : '견적서·시방서'

  useEffect(() => {
    document.title = `${docLabel}_${lead.company_name}_${quote.quote_number ?? ''}`
  }, [docLabel, lead.company_name, quote.quote_number])

  // 공개 링크로 고객이 열람하면 조회 기록 → 재열람 시 대표에게 알림
  useEffect(() => {
    if (variant !== 'public' || !publicToken) return
    try {
      const payload = JSON.stringify({ token: publicToken })
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon('/api/track/b2b-quote-view', blob)
    } catch {
      // 추적 실패가 고객 열람을 막지 않도록 무시
    }
  }, [variant, publicToken])

  const handleCopyLink = async () => {
    if (!publicToken) return
    const base = `${window.location.origin}/quote/${publicToken}`
    // 특정 문서만 보내고 싶으면 ?doc= 를 붙임 (둘 다는 파라미터 없음)
    const url = mode === 'both' ? base : `${base}?doc=${mode}`
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
      {/* 상단 툴바 (화면에서만 보임, 인쇄 시 숨김) */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex flex-wrap items-center gap-2 justify-end max-w-[calc(100vw-2rem)]">
        {/* 문서 선택 토글 */}
        {hasSpec && (
          <div className="flex rounded-lg border bg-white shadow-lg overflow-hidden text-sm font-medium">
            {([['both', '둘 다'], ['quote', '견적서'], ['spec', '시방서']] as [DocMode, string][]).map(([m, label]) => (
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

        <button
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-lg hover:bg-primary/90"
        >
          PDF로 저장
        </button>

        {variant === 'internal' && publicToken && (
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

      <div className="max-w-[210mm] mx-auto bg-white p-[20mm] text-[14px] leading-relaxed print:p-[15mm] print:max-w-none font-sans">

        {/* ── 견적서 ─────────────────────────────── */}
        {showQuote && (
        <div className="mb-12 print:mb-10">

          {/* 헤더 */}
          <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">견 적 서</h1>
              <p className="text-sm text-gray-500 mt-1">ESTIMATE</p>
            </div>
            <div className="text-right text-sm text-gray-600 space-y-0.5">
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
                {showCountCol && <th className="py-2.5 px-3 text-center font-medium w-16">{countLabel}</th>}
                {showUnitPriceCol && <th className="py-2.5 px-3 text-right font-medium w-28">단가</th>}
                <th className="py-2.5 px-3 text-right font-medium w-28">금액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-2.5 px-3 text-gray-500">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-medium">{item.name}</td>
                  <td className="py-2.5 px-3 text-center text-gray-600">{item.unit}</td>
                  {showCountCol && <td className="py-2.5 px-3 text-center">{item.qty}</td>}
                  {showUnitPriceCol && <td className="py-2.5 px-3 text-right tabular-nums">{item.unit_price.toLocaleString()}</td>}
                  <td className="py-2.5 px-3 text-right tabular-nums font-medium">{lineTotal(item).toLocaleString()}</td>
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
        )}

        {/* ── 시방서 (둘 다 보기일 때만 페이지 구분) ─────────────────────── */}
        {showSpec && (
          <div className={mode === 'both' ? 'print:break-before-page' : ''}>
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

            {/* 서명란 */}
            <div className="mt-16 flex justify-end">
              <div className="text-center space-y-2">
                <p className="text-sm text-gray-600">{issueDate}</p>
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
