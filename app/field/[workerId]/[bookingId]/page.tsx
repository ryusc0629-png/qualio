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

  // 접근 권한 확인: 직접 배정(worker_id) 또는 팀원 배정(booking_workers) 중 하나라도 해당되어야 함
  const [{ data: directCheck }, { data: teamCheck }] = await Promise.all([
    db
      .from('bookings')
      .select('id')
      .eq('id', bookingId)
      .eq('business_id', worker.business_id)
      .eq('worker_id' as never, workerId)
      .maybeSingle(),
    db
      .from('booking_workers' as never)
      .select('booking_id' as never)
      .eq('booking_id' as never, bookingId)
      .eq('worker_id' as never, workerId)
      .maybeSingle() as unknown as Promise<{ data: { booking_id: string } | null }>,
  ])

  if (!directCheck && !teamCheck) notFound()

  // 예약 상세 조회 (메모 최종 저장자 포함)
  const { data: booking } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, service_address, scheduled_at, final_price, status, memo, customer_request, quote_id, memo_updated_by, memo_updated_at, on_my_way_sent_at, contract_id, checkin_at, checkout_at, open_photo_urls, lockup_photo_urls, checklist_photos' as never)
    .eq('id', bookingId)
    .eq('business_id', worker.business_id)
    .maybeSingle() as { data: {
      id: string; customer_name: string; customer_phone: string | null
      service_address: string | null; scheduled_at: string; final_price: number
      status: string; memo: string | null; customer_request: string | null; quote_id: string | null
      memo_updated_by: string | null; memo_updated_at: string | null
      on_my_way_sent_at: string | null
      contract_id: string | null; checkin_at: string | null; checkout_at: string | null
      open_photo_urls: string[] | null; lockup_photo_urls: string[] | null
      checklist_photos: Record<string, string[]> | null
    } | null }

  if (!booking) notFound()

  // 문단속 설정 + 작업 체크리스트 — 이 방문이 소속된 정기계약에서 가져온다
  let requiresLockup = false
  let checklistItems: { id: string; label: string }[] = []
  if (booking.contract_id) {
    const { data: contract } = await db
      .from('contracts')
      .select('requires_lockup, checklist_items' as never)
      .eq('id', booking.contract_id)
      .maybeSingle() as { data: { requires_lockup: boolean | null; checklist_items: { id: string; label: string }[] | null } | null }
    requiresLockup = contract?.requires_lockup === true
    checklistItems = contract?.checklist_items ?? []
  }

  // 보고서 진행 상황 조회 — 사진·영상·메모를 어디까지 채웠는지 작업 상세에서 한눈에 보여준다.
  // (입력은 전부 보고서 화면 한 곳에서 한다. 여기선 '얼마나 남았는지'만 알려준다)
  const { data: report } = await db
    .from('reports')
    .select('id, notes, kakao_sent_at, work_clip_urls, report_photos(url, type)' as never)
    .eq('booking_id', bookingId)
    .maybeSingle() as { data: {
      id: string; notes: string | null; kakao_sent_at: string | null
      work_clip_urls: string[] | null
      report_photos: { url: string; type: string }[]
    } | null }

  const reportPhotos = report?.report_photos ?? []
  const reportProgress = {
    beforeCount: reportPhotos.filter((p) => p.type === 'before').length,
    afterCount:  reportPhotos.filter((p) => p.type === 'after').length,
    clipCount:   (report?.work_clip_urls ?? []).filter(Boolean).length,
    hasNotes:    !!report?.notes?.trim(),
  }

  // 출발 알림 수신 설정
  let notifyOnMyWay = true
  if (booking.customer_phone) {
    const { data: customer } = await db
      .from('customers')
      .select('notify_on_my_way' as never)
      .eq('business_id', worker.business_id)
      .eq('phone', booking.customer_phone)
      .maybeSingle() as { data: { notify_on_my_way: boolean | null } | null }

    if (customer && customer.notify_on_my_way === false) notifyOnMyWay = false
  }

  return (
    <FieldBookingClient
      workerId={workerId}
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
      reportSentAt={report?.kakao_sent_at ?? null}
      reportProgress={reportProgress}
      notifyOnMyWay={notifyOnMyWay}
      onMyWaySentAt={booking.on_my_way_sent_at}
      requiresLockup={requiresLockup}
      isRecurring={!!booking.contract_id}
      existingOpenPhotoUrls={booking.open_photo_urls ?? []}
      existingLockupPhotoUrls={booking.lockup_photo_urls ?? []}
      checkinAt={booking.checkin_at}
      checkoutAt={booking.checkout_at}
      checklistItems={checklistItems}
      existingChecklistPhotos={booking.checklist_photos ?? {}}
    />
  )
}
