import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { Phone, MapPin, Calendar, CreditCard, Receipt } from 'lucide-react'

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
      .select('id, customer_name, service_address, scheduled_at, selected_tier, final_price, status, quote_id')
      .eq('id', bookingId)
      .eq('business_id', businessId)
      .maybeSingle(),
    db
      .from('businesses')
      .select('name, phone')
      .eq('id', businessId)
      .maybeSingle(),
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
    <div className="min-h-screen bg-[#F9F8F6]">

      {/* 헤더 */}
      <header className="bg-white sticky top-0 z-10 border-b border-border">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
              {business.name.slice(0, 1)}
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">{business.name}</p>
              <p className="text-[11px] text-zinc-400">영수증</p>
            </div>
          </div>
          {business.phone && (
            <a href={`tel:${business.phone}`} className="flex items-center gap-1.5 text-primary text-sm font-semibold">
              <Phone className="h-3.5 w-3.5" />
              {business.phone}
            </a>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-16 pt-6 space-y-4">

        {/* 영수증 상단 */}
        <div className="bg-white rounded-3xl px-5 py-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-primary" />
            <p className="font-extrabold text-lg text-zinc-900">영수증</p>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-400 mb-5 pb-4 border-b border-dashed border-zinc-200">
            <span>발행번호 {receiptNo}</span>
            <span>발행일 {formatIssuedDate()}</span>
          </div>

          <div className="space-y-0 divide-y divide-zinc-100">
            <Row icon={<span className="text-xs font-bold text-zinc-400 w-4">공급자</span>} value={business.name} />
            <Row icon={<span className="text-xs font-bold text-zinc-400 w-4">고객</span>} value={booking.customer_name} />
            <Row
              icon={<Calendar className="h-4 w-4 text-zinc-400" />}
              label="작업일시"
              value={workedAtKr}
            />
            {booking.service_address && (
              <Row
                icon={<MapPin className="h-4 w-4 text-zinc-400" />}
                label="작업주소"
                value={booking.service_address}
              />
            )}
            <Row
              icon={<span className="text-xs text-zinc-400 w-4">플랜</span>}
              label="서비스"
              value={`${serviceName} (${tierLabel})`}
            />
          </div>

          {/* 결제 금액 강조 */}
          <div className="mt-5 pt-4 border-t-2 border-dashed border-zinc-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-semibold text-zinc-600">결제 금액</span>
              </div>
              <span className="text-2xl font-extrabold text-primary tabular-nums">
                {amountKr}원
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 text-right">부가세 포함</p>
          </div>
        </div>

        {/* 업체 연락처 */}
        {business.phone && (
          <a
            href={`tel:${business.phone}`}
            className="flex items-center justify-between bg-white rounded-2xl px-4 py-4 shadow-sm"
          >
            <div>
              <p className="font-bold text-sm text-zinc-900">문의하기</p>
              <p className="text-xs text-zinc-500 mt-0.5">{business.name} · {business.phone}</p>
            </div>
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shrink-0">
              <Phone className="h-4 w-4 text-white" />
            </div>
          </a>
        )}

        <p className="text-center text-xs text-zinc-400 pt-2">Powered by 퀄리오</p>
      </main>
    </div>
  )
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label?: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      {label && <span className="text-xs text-zinc-500 w-16 shrink-0 mt-0.5">{label}</span>}
      <span className="text-sm font-semibold text-zinc-900 break-keep flex-1">{value}</span>
    </div>
  )
}
