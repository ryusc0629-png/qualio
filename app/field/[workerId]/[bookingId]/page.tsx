import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { FieldBookingClient } from './field-booking-client'

// workers 테이블 타입 (Supabase 타입 아직 미생성)
interface WorkerRow {
  id: string
  name: string
  business_id: string
  is_active: boolean
}

interface Props {
  params: Promise<{ workerId: string; bookingId: string }>
}

export default async function FieldBookingPage({ params }: Props) {
  const { workerId, bookingId } = await params
  const db = createServiceClient()

  // 직원 검증
  const { data: worker } = await db
    .from('workers' as never)
    .select('id, name, business_id, is_active' as never)
    .eq('id' as never, workerId)
    .maybeSingle() as { data: WorkerRow | null }

  if (!worker || !worker.is_active) notFound()

  // 예약 조회 (해당 직원에게 배정된 것만)
  const { data: booking } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, service_address, scheduled_at, final_price, status, memo, customer_request, quote_id' as never)
    .eq('id', bookingId)
    .eq('business_id', worker.business_id)
    .eq('worker_id' as never, workerId)
    .maybeSingle() as { data: {
      id: string; customer_name: string; customer_phone: string | null
      service_address: string | null; scheduled_at: string; final_price: number
      status: string; memo: string | null; customer_request: string | null; quote_id: string | null
    } | null }

  if (!booking) notFound()

  // 보고서 + 작업 전 사진 조회
  const { data: report } = await db
    .from('reports')
    .select('id, notes, kakao_sent_at, report_photos(url, type, sort_order)')
    .eq('booking_id', bookingId)
    .maybeSingle()

  const beforeUrls = ((report?.report_photos ?? []) as { url: string; type: string; sort_order: number }[])
    .filter((p) => p.type === 'before')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => p.url)

  // 다음 방문 참고사항 로드 (customers.notes에서 이 예약 날짜의 마지막 기록)
  let savedNextVisitNote = ''
  if (booking.customer_phone) {
    const { data: customer } = await db
      .from('customers')
      .select('notes')
      .eq('business_id', worker.business_id)
      .eq('phone', booking.customer_phone)
      .maybeSingle()

    if (customer?.notes) {
      // 오늘 날짜로 저장된 마지막 메모를 추출
      const today = new Date().toLocaleDateString('ko-KR')
      const entries = (customer.notes as string).split('\n\n')
      const todayEntry = entries.filter((e: string) => e.startsWith(`[${today}]`)).pop()
      if (todayEntry) {
        savedNextVisitNote = todayEntry.replace(`[${today}] `, '')
      }
    }
  }

  return (
    <FieldBookingClient
      workerId={workerId}
      workerName={worker.name}
      businessId={worker.business_id}
      booking={{
        id: booking.id,
        customerName: booking.customer_name,
        customerPhone: booking.customer_phone,
        serviceAddress: booking.service_address,
        scheduledAt: booking.scheduled_at,
        finalPrice: booking.final_price,
        status: booking.status,
        memo: booking.memo,
      }}
      reportId={report?.id ?? null}
      reportSentAt={report?.kakao_sent_at ?? null}
      existingBeforeUrls={beforeUrls}
      existingCustomerRequest={(booking.customer_request as string) ?? ''}
      existingNextVisitNote={savedNextVisitNote}
    />
  )
}
