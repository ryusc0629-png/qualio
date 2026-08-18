import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import {
  DocPage, DocHeader, DocMeta, DocLede, DocSignature,
} from '@/components/report/document'

interface PageProps {
  params: Promise<{ businessId: string; bookingId: string }>
}

function formatKoreanDate(isoString: string): string {
  return new Date(isoString).toLocaleString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

function formatIssuedDate(): string {
  return new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
}

export default async function ReceiptPage({ params }: PageProps) {
  const { businessId, bookingId } = await params
  const db = createServiceClient()

  const [{ data: booking }, { data: business }] = await Promise.all([
    db
      .from('bookings')
      .select('id, customer_name, customer_id, service_address, scheduled_at, selected_tier, final_price, status, quote_id')
      .eq('id', bookingId)
      .eq('business_id', businessId)
      .maybeSingle(),
    // favicon_url은 database.ts 타입에 아직 없어 단언으로 받는다 (CLAUDE.md 새 컬럼 패턴)
    db
      .from('businesses')
      .select('name, phone, logo_url, favicon_url' as never)
      .eq('id', businessId)
      .maybeSingle() as unknown as PromiseLike<{ data: {
        name: string; phone: string | null; logo_url: string | null; favicon_url: string | null
      } | null }>,
  ])

  // 완료된 예약만 영수증 발행 가능
  if (!booking || !business || booking.status !== 'completed') notFound()

  let serviceName = '청소 서비스'
  if (booking.quote_id) {
    const { data: quote } = await db
      .from('quotes')
      .select('cleaning_type')
      .eq('id', booking.quote_id)
      .maybeSingle()
    if (quote?.cleaning_type) serviceName = quote.cleaning_type
  }

  // 개인 고객인지 법인(거래처)인지 — 부가세를 어떻게 적을지가 갈린다.
  //
  // 개인: 낸 금액이 전부다. 부가세를 따로 적으면 오히려 헷갈린다.
  // 법인: 세금계산서를 끊으므로 공급가액과 부가세를 나눠 적어야 담당자가 그대로 올릴 수 있다.
  //
  // ⚠️ 이 앱은 입력 금액을 '부가세 별도(공급가액)'로 다룬다(정기계약 월 금액도 같은 기준).
  //    그래서 법인 영수증의 합계는 공급가액 + 10%다.
  //    고객 연결이 없으면 개인 기준으로 본다 — 일회성은 개인이 대부분이다.
  let isCompany = false
  if (booking.customer_id) {
    const { data: customer } = await db
      .from('customers')
      .select('type')
      .eq('id', booking.customer_id)
      .maybeSingle()
    isCompany = customer?.type === 'recurring'
  }

  const TIER_LABELS: Record<string, string> = { good: '기본', better: '추천', best: '프리미엄' }
  const tierLabel  = TIER_LABELS[booking.selected_tier ?? 'good'] ?? booking.selected_tier ?? '기본'
  const supply     = booking.final_price ?? 0
  const vat        = Math.round(supply * 0.1)
  const amountKr   = supply.toLocaleString('ko-KR')
  const supplyKr   = supply.toLocaleString('ko-KR')
  const vatKr      = vat.toLocaleString('ko-KR')
  const totalKr    = (supply + vat).toLocaleString('ko-KR')
  const workedAtKr = booking.scheduled_at ? formatKoreanDate(booking.scheduled_at) : '—'
  const receiptNo  = `${bookingId.slice(0, 8).toUpperCase()}`

  return (
    <DocPage>
      <DocHeader
        businessName={business.name}
        businessPhone={business.phone}
        title="영수증"
        docNo={`RC-${receiptNo}`}
      />
      <DocMeta
        items={[
          { k: '고객', v: booking.customer_name ?? '' },
          { k: '작업일', v: workedAtKr },
          { k: '서비스', v: `${serviceName} (${tierLabel})` },
          { k: '현장', v: booking.service_address ?? '' },
        ]}
      />

      <DocLede>
        {booking.customer_name ? `${booking.customer_name}님, ` : ''}결제가 정상적으로 처리되었습니다.
        아래와 같이 영수증을 발행해 드립니다.
      </DocLede>

      {/* 금액 — 이 문서의 결론이라 유일하게 크게 쓴다 */}
      <div className="mt-8 border-y-2 border-slate-900 py-5">
        {isCompany ? (
          <>
            <div className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-slate-500">공급가액</span>
              <span className="font-medium text-slate-900 tabular-nums">{supplyKr}원</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-[13px] mt-2">
              <span className="text-slate-500">부가세 (10%)</span>
              <span className="font-medium text-slate-900 tabular-nums">{vatKr}원</span>
            </div>
            <div className="flex items-end justify-between gap-4 mt-4 pt-4 border-t border-slate-200">
              <span className="text-[13px] font-semibold text-slate-600">합계 금액</span>
              <p className="text-[28px] leading-none font-bold text-slate-900 tabular-nums">{totalKr}원</p>
            </div>
          </>
        ) : (
          <div className="flex items-end justify-between gap-4">
            <span className="text-[13px] font-semibold text-slate-600">결제 금액</span>
            <p className="text-[28px] leading-none font-bold text-slate-900 tabular-nums">{amountKr}원</p>
          </div>
        )}
      </div>

      <p className="text-[12px] text-slate-500 mt-4">
        발행일 {formatIssuedDate()}
        {business.phone && <> · 문의 {business.phone}</>}
      </p>

      <DocSignature
        businessName={business.name}
        businessPhone={business.phone}
        issuedLabel={formatIssuedDate()}
      />
    </DocPage>
  )
}
