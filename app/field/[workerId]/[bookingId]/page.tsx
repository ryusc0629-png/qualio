import { createServiceClient } from '@/lib/supabase/server'
import { formatPhone } from '@/lib/format/phone'
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

  // 출발 알림 수신 설정 + 이 현장에서 알아야 할 것(고객 메모)
  //
  // customers.notes에는 직원들이 '다음에 올 직원이 알아야 할 것'을 날짜와 함께 쌓아왔는데,
  // 정작 그 다음 직원에게 보여주는 화면이 없었다. 쓰기만 하고 읽지는 못했다.
  let notifyOnMyWay = true
  let customerNotes: string | null = null
  if (booking.customer_phone) {
    const { data: customer } = await db
      .from('customers')
      .select('notify_on_my_way, notes' as never)
      .eq('business_id', worker.business_id)
      .eq('phone', booking.customer_phone)
      .maybeSingle() as { data: { notify_on_my_way: boolean | null; notes: string | null } | null }

    if (customer && customer.notify_on_my_way === false) notifyOnMyWay = false
    customerNotes = customer?.notes ?? null
  }

  // 이 고객의 미해결 클레임 — 사장님이 대시보드에서 접수한 고객 불만이다.
  // 지금까지는 담당자를 지정할 때 푸시 한 번이 전부라, 알림을 지나치면 현장에서 볼 방법이 없었다.
  let openClaims: { id: string; title: string; content: string | null; isUrgent: boolean }[] = []
  if (booking.customer_phone) {
    // ⚠️ 같은 번호가 '010-1234-5678'과 '01012345678' 두 형태로 저장돼 있다.
    //    그대로 비교하면 다른 사람으로 보여 클레임이 통째로 안 뜬다.
    const digits = booking.customer_phone.replace(/[^0-9]/g, '')
    const phoneVariants = [...new Set([booking.customer_phone, digits, formatPhone(digits)])]

    const { data: claimRows } = (await db
      .from('claims' as never)
      .select('id, title, content, is_urgent' as never)
      .eq('business_id' as never, worker.business_id)
      .in('customer_phone' as never, phoneVariants as never)
      .eq('status' as never, 'open')
      .order('created_at' as never, { ascending: false })
      .limit(3)) as unknown as {
        data: { id: string; title: string; content: string | null; is_urgent: boolean }[] | null
      }

    openClaims = (claimRows ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content,
      isUrgent: c.is_urgent,
    }))
  }

  return (
    <FieldBookingClient
      workerId={workerId}
      businessId={worker.business_id}
      // 결제 요청 알림톡 템플릿이 준비됐는지. 카카오 검수를 통과해 환경변수가 채워지기 전에는
      // 버튼을 눌러도 카톡이 못 나가므로, 아예 띄우지 않고 이유를 한 줄로 알려준다.
      // (예전엔 이 자리에서 '영수증' 템플릿을 대신 보내 "결제가 완료되었습니다"가 먼저 나갔다)
      paymentRequestReady={!!process.env.SOLAPI_TEMPLATE_ID_PAYMENT_REQUEST}
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
      // 사장님이 남긴 이번 방문 메모인지 구분한다.
      //   · 마지막에 쓴 사람이 직원이면 자기가 적은 특이사항이라 '전달사항'이 아니다
      //   · 정기 방문은 자동 생성될 때 memo에 '정기계약 · 공용부 청소'가 박힌다.
      //     그건 사장님이 남긴 말이 아니라 시스템이 붙인 꼬리표라, 띄우면 매 방문 같은 줄만 뜬다
      ownerMemo={
        booking.memo_updated_by || (booking.memo ?? '').startsWith('정기계약 ·')
          ? null
          : booking.memo
      }
      customerNotes={customerNotes}
      openClaims={openClaims}
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
