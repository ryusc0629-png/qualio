import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { OwnerReportClient } from './owner-report-client'

interface Props {
  params: Promise<{ bookingId: string }>
}

export default async function OwnerReportPage({ params }: Props) {
  const { bookingId } = await params

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()

  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')

  // 예약 조회 (이 업체 소속인지 검증)
  const { data: booking } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, service_address, scheduled_at, status')
    .eq('id', bookingId)
    .eq('business_id', profile.business_id)
    .maybeSingle()

  if (!booking) notFound()

  // 기존 보고서 + 사진 조회
  const { data: report } = await db
    .from('reports')
    .select('id, notes, kakao_sent_at, ai_report_data, report_photos(url, type, sort_order)' as never)
    .eq('booking_id', bookingId)
    .maybeSingle() as {
      data: {
        id: string
        notes: string | null
        kakao_sent_at: string | null
        ai_report_data: {
          beforeStatus: string
          workDetails: string
          afterResult: string
          additionalNotes: string
          recommendedServices: string[]
        } | null
        report_photos: { url: string; type: string; sort_order: number }[]
      } | null
    }

  const photos = report?.report_photos ?? []
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
    .eq('business_id', profile.business_id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')

  return (
    <OwnerReportClient
      businessId={profile.business_id}
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
        aiReportData: report.ai_report_data ?? null,
      } : null}
      serviceItems={(services ?? []).map((s) => ({
        name: s.name,
        basePrice: s.base_price,
      }))}
    />
  )
}
