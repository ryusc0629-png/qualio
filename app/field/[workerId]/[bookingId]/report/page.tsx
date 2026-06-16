import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { FieldReportClient } from './field-report-client'

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

export default async function FieldReportPage({ params }: Props) {
  const { workerId, bookingId } = await params
  const db = createServiceClient()

  // 직원 검증
  const { data: worker } = await db
    .from('workers' as never)
    .select('id, name, business_id, is_active' as never)
    .eq('id' as never, workerId)
    .maybeSingle() as { data: WorkerRow | null }

  if (!worker || !worker.is_active) notFound()

  // 예약 조회
  const { data: booking } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, service_address, scheduled_at, status')
    .eq('id', bookingId)
    .eq('business_id', worker.business_id)
    .eq('worker_id' as never, workerId)
    .maybeSingle()

  if (!booking) notFound()

  // 기존 보고서 + 사진 조회
  const { data: report } = await db
    .from('reports')
    .select('id, notes, kakao_sent_at, report_photos(url, type, sort_order)')
    .eq('booking_id', bookingId)
    .maybeSingle()

  const photos = (report?.report_photos ?? []) as { url: string; type: string; sort_order: number }[]

  const existingBefore = photos
    .filter((p) => p.type === 'before')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => p.url)

  const existingAfter = photos
    .filter((p) => p.type === 'after')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => p.url)

  // 업체 서비스 항목 조회 (AI 추천용)
  const { data: services } = await db
    .from('service_items')
    .select('name, base_price')
    .eq('business_id', worker.business_id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')

  return (
    <FieldReportClient
      workerId={workerId}
      businessId={worker.business_id}
      booking={{
        id: booking.id,
        customerName: booking.customer_name,
        customerPhone: booking.customer_phone,
        serviceAddress: booking.service_address,
        scheduledAt: booking.scheduled_at,
      }}
      existingReport={report ? {
        id: report.id,
        notes: report.notes,
        sentAt: report.kakao_sent_at,
        beforeUrls: existingBefore,
        afterUrls: existingAfter,
      } : null}
      serviceItems={(services ?? []).map((s) => ({
        name: s.name,
        basePrice: s.base_price,
      }))}
    />
  )
}
