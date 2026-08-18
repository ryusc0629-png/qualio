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

  const TIER_LABELS: Record<string, string> = { good: '기본', better: '추천', best: '프리미엄' }
  const tierLabel  = TIER_LABELS[booking.selected_tier ?? 'good'] ?? booking.selected_tier ?? '기본'
  const amountKr   = (booking.final_price ?? 0).toLocaleString('ko-KR')
  const workedAtKr = booking.scheduled_at ? formatKoreanDate(booking.scheduled_at) : '—'
  const receiptNo  = `${bookingId.slice(0, 8).toUpperCase()}`

  return (
    <DocPage>
      <DocHeader
        businessName={business.name}
        businessPhone={business.phone}
        businessLogoUrl={business.logo_url}
        businessFaviconUrl={business.favicon_url}
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

      {/* 금액 — 이 문서의 결론이라 유일하게 크게 쓴다.
          ⚠️ 금액은 항상 '부가세 별도(공급가액)'로 적는다. 사장님 결정(2026-08-18):
             개인·법인마다 다르게 적으면 사장님도 고객도 헷갈린다. 하나로 고정. */}
      <div className="mt-8 border-y-2 border-slate-900 py-5 flex items-end justify-between gap-4">
        <span className="text-[13px] font-semibold text-slate-600">결제 금액</span>
        <div className="text-right">
          <p className="text-[28px] leading-none font-bold text-slate-900 tabular-nums">{amountKr}원</p>
          <p className="text-[11px] text-slate-400 mt-1.5">부가세 별도</p>
        </div>
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
