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
    .select('id, customer_name, customer_phone, service_address, scheduled_at, final_price, status, memo, quote_id')
    .eq('id', bookingId)
    .eq('business_id', worker.business_id)
    .eq('worker_id' as never, workerId)
    .maybeSingle()

  if (!booking) notFound()

  // 보고서 유무 확인
  const { data: report } = await db
    .from('reports')
    .select('id, kakao_sent_at')
    .eq('booking_id', bookingId)
    .maybeSingle()

  return (
    <FieldBookingClient
      workerId={workerId}
      workerName={worker.name}
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
    />
  )
}
