'use server'

import { randomBytes } from 'crypto'
import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendPaymentRequestAlimtalk,
  sendReceiptAlimtalk,
  sendReviewRequestAlimtalk,
  sendWorkCompleteAlimtalk,
} from '@/lib/kakao/alimtalk'
import { sendOnMyWayForBooking } from '@/lib/kakao/on-my-way'
import { ensureOnboardingDraft } from '@/lib/onboarding/draft-from-field'
import { addMonths } from '@/lib/reports/care-due'
import { syncFieldSuggestions } from '@/lib/reengagement/suggestion'
import { generateAiReport, polishCareAdvice } from '@/lib/ai/report-writer'
import { geocodeAddress } from '@/lib/roadmap/geo'
import { postBookingRevenue } from '@/lib/finance/post-booking-revenue'
import { assertReportSendable } from '@/lib/utils/report-send-guard'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { queueReelForBooking } from '@/lib/reel/queue'
import { spendQuota } from '@/lib/ratelimit/daily-quota'

// workers 테이블 타입 (Supabase 타입 아직 미생성)
interface WorkerRow {
  id: string
  business_id: string
  name: string
  /** 'employee' | 'contractor' — 고객 문구에서 도급사를 가릴 때 쓴다 */
  type: string | null
  is_active: boolean
}

interface BookingRow {
  id: string
  business_id: string
  worker_id: string | null
  customer_name: string
  customer_phone: string | null
  service_address: string | null
  scheduled_at: string
  final_price: number
  status: string
  memo: string | null
  quote_id: string | null
  contract_id: string | null // 정기계약 방문이면 계약 id — 고객 알림톡 발송 여부 판정에 쓴다
}

// 직원 인증 — workerId로 직원과 업체 정보를 한 번에 검증
async function verifyWorker(workerId: string) {
  const db = createServiceClient()
  const { data: worker } = await db
    .from('workers' as never)
    .select('id, business_id, name, type, is_active' as never)
    .eq('id' as never, workerId)
    .maybeSingle() as { data: WorkerRow | null }

  if (!worker) throw new Error('[APP] 직원 정보를 찾을 수 없습니다')
  if (!worker.is_active) throw new Error('[APP] 비활성 계정입니다. 사장님께 문의해주세요')

  return { db, worker }
}

// 직원에게 배정된 예약인지 확인 (직접 배정 OR 팀원 배정 모두 허용)
async function verifyBookingOwnership(
  db: ReturnType<typeof createServiceClient>,
  bookingId: string,
  workerId: string,
  businessId: string,
) {
  // booking_workers에서 팀원 배정 여부 확인 (직접 배정 포함)
  const [{ data: booking }, { data: teamCheck }] = await Promise.all([
    db
      .from('bookings')
      .select('id, business_id, worker_id, customer_name, customer_phone, service_address, scheduled_at, final_price, status, memo, quote_id, contract_id' as never)
      .eq('id', bookingId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as Promise<{ data: BookingRow | null }>,
    db
      .from('booking_workers' as never)
      .select('booking_id' as never)
      .eq('booking_id' as never, bookingId)
      .eq('worker_id' as never, workerId)
      .maybeSingle() as unknown as Promise<{ data: { booking_id: string } | null }>,
  ])

  if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

  // worker_id 직접 배정 또는 booking_workers 팀원 배정 중 하나라도 해당되어야 함
  const isDirectAssigned = booking.worker_id === workerId
  const isTeamAssigned   = !!teamCheck

  if (!isDirectAssigned && !isTeamAssigned) throw new Error('[APP] 배정된 작업이 아니거나 존재하지 않습니다')

  return booking
}

// 작업 시작 (confirmed → in_progress)
export const fieldStartWorkAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 팀 작업: 다른 팀원이 이미 시작한 경우 그냥 성공 처리
    if (booking.status === 'in_progress') {
      return { success: true }
    }

    if (booking.status !== 'confirmed') {
      throw new Error('[APP] 확정된 예약만 작업을 시작할 수 있어요')
    }

    const { error } = await db
      .from('bookings')
      .update({ status: 'in_progress' })
      .eq('id', parsedInput.bookingId)

    if (error) throw new Error('[APP] 상태 변경에 실패했어요')

    return { success: true }
  })

// 기사 출발 알림 (현장 직원이 이동 중 탭) — 고객 수신 설정 확인 후 발송
export const fieldSendOnMyWayAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const result = await sendOnMyWayForBooking(db as unknown as SupabaseClient, worker.business_id, {
      id: booking.id,
      customer_name: booking.customer_name,
      customer_phone: booking.customer_phone,
      scheduled_at: booking.scheduled_at,
      quote_id: booking.quote_id,
    })

    return { success: true, sent: result.sent, skipped: result.skipped }
  })

// 메모 저장 (3종 메모를 한 번에 저장)
export const fieldSaveMemoAction = action
  .schema(z.object({
    workerId:        z.string().uuid(),
    bookingId:       z.string().uuid(),
    siteMemo:        z.string().max(1000).optional(),
    customerRequest: z.string().max(1000).optional(),
    nextVisitNote:   z.string().max(1000).optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 1. 현장 특이사항 → bookings.memo + 최종 저장자 기록
    if (parsedInput.siteMemo !== undefined) {
      await db
        .from('bookings')
        .update({
          memo: parsedInput.siteMemo || null,
          memo_updated_by: worker.id,
          memo_updated_at: new Date().toISOString(),
        } as never)
        .eq('id', parsedInput.bookingId)
    }

    // 2. 고객 추가 요청사항 → bookings.customer_request
    if (parsedInput.customerRequest !== undefined) {
      await db
        .from('bookings')
        .update({ customer_request: parsedInput.customerRequest || null } as never)
        .eq('id', parsedInput.bookingId)
    }

    // 3. 다음 방문 참고사항 → customers.notes (전화번호로 고객 찾기, 없으면 생성)
    if (parsedInput.nextVisitNote && booking.customer_phone) {
      const { data: customer } = await db
        .from('customers')
        .select('id, notes')
        .eq('business_id', worker.business_id)
        .eq('phone', booking.customer_phone)
        .maybeSingle()

      const today = new Date().toLocaleDateString('ko-KR')
      const noteEntry = `[${today}] ${parsedInput.nextVisitNote}`

      if (customer) {
        const newNote = customer.notes
          ? `${customer.notes}\n\n${noteEntry}`
          : noteEntry

        await db
          .from('customers')
          .update({ notes: newNote })
          .eq('id', customer.id)
      } else {
        // 고객이 아직 없으면 생성
        await db.from('customers').insert({
          business_id: worker.business_id,
          name: booking.customer_name,
          phone: booking.customer_phone,
          address: booking.service_address ?? null,
          type: 'one_time',
          notes: noteEntry,
        })
      }
    }

    return { success: true }
  })

// 결제 요청 (작업은 끝났고 아직 수금 전 — 고객에게 금액을 알린다)
export const fieldRequestPaymentAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    if (!booking.customer_phone) throw new Error('[APP] 고객 연락처가 없어 결제 요청을 보낼 수 없어요')

    // 업체 정보
    const { data: business } = await db
      .from('businesses')
      .select('name, phone')
      .eq('id', worker.business_id)
      .maybeSingle()

    if (!business) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // 서비스명
    let cleaningType = '청소 서비스'
    if (booking.quote_id) {
      const { data: quote } = await db
        .from('quotes')
        .select('cleaning_type')
        .eq('id', booking.quote_id)
        .maybeSingle()
      if (quote?.cleaning_type) cleaningType = quote.cleaning_type
    }

    // 영수증이 아니라 '결제 요청'을 보낸다. 이 시점엔 아직 돈을 받지 않았고,
    // 영수증 페이지도 completed가 아니라 열리지 않는다.
    const sent = await sendPaymentRequestAlimtalk({
      customerPhone: booking.customer_phone,
      customerName:  booking.customer_name,
      businessName:  business.name,
      businessPhone: business.phone ?? null,
      cleaningType,
      workedAt:      booking.scheduled_at,
      amount:        Math.round(booking.final_price ?? 0),
    })

    // 안 나갔는데 "보냈어요!"가 뜨면 기사가 고객에게 말도 안 하고 넘어간다
    if (!sent) throw new Error('[APP] 결제 요청 카톡은 아직 준비 중이에요. 금액을 직접 알려주세요')

    return { success: true }
  })

// 수금 완료 (in_progress → completed) + 리뷰 자동 발송 (skipReview=true면 발송 생략)
export const fieldCompletePaymentAction = action
  .schema(z.object({
    workerId:   z.string().uuid(),
    bookingId:  z.string().uuid(),
    skipReview: z.boolean().optional(),
    // 실제 받은 금액 — 생략하면 전액(final_price) 받은 것으로 처리. 일부만 받으면 나머지는 미수금.
    paidAmount: z.coerce.number().int().min(0).optional(),
    // 법인 현장에서 그 자리에 못 받는 경우 — 계산서 끊고 결재가 돌아야 입금된다.
    // 현장은 작업만 끝내고, 청구는 사장님이 이어받도록 알림을 보낸다.
    invoiceRequested: z.boolean().optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    if (booking.status !== 'in_progress') {
      throw new Error('[APP] 작업 중인 예약만 수금 완료할 수 있어요')
    }

    // 작업 매뉴얼(체크리스트)이 있으면 모든 항목에 사진 1장 이상 있어야 완료 가능
    const { data: bChk } = await db
      .from('bookings')
      .select('contract_id, checklist_photos' as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', worker.business_id)
      .maybeSingle() as unknown as { data: { contract_id: string | null; checklist_photos: Record<string, string[]> | null } | null }
    if (bChk?.contract_id) {
      const { data: contract } = await db
        .from('contracts')
        .select('checklist_items' as never)
        .eq('id', bChk.contract_id)
        .maybeSingle() as unknown as { data: { checklist_items: { id: string; label: string }[] | null } | null }
      const items = contract?.checklist_items ?? []
      if (items.length > 0) {
        const progress = bChk.checklist_photos ?? {}
        const done = items.every((it) => (progress[it.id]?.length ?? 0) > 0)
        if (!done) throw new Error('[APP] 작업 항목 사진을 모두 올려야 완료할 수 있어요')
      }
    }

    // 상태 → completed
    const { error } = await db
      .from('bookings')
      .update({ status: 'completed' })
      .eq('id', parsedInput.bookingId)

    if (error) throw new Error('[APP] 상태 변경에 실패했어요')

    // 계산서 청구 건은 현장에서 받은 돈이 0원 — 전액이 '못 받은 돈'으로 남아 재무 화면에 뜬다
    const paid = parsedInput.invoiceRequested
      ? 0
      : parsedInput.paidAmount ?? Math.round(booking.final_price ?? 0)

    // 수금액 기록 + 매출 장부 자동 반영 — 일회성 예약만(정기는 월말 정산이라 제외)
    if (!bChk?.contract_id) {
      await db
        .from('bookings')
        .update({ paid_amount: paid } as never)
        .eq('id', parsedInput.bookingId)
        .eq('business_id', worker.business_id)
      // 완료된 일회성 매출을 장부에 자동 기록(멱등) → 사장님 이중 입력 제거
      await postBookingRevenue(db, worker.business_id, parsedInput.bookingId)
    }

    // 업체 정보 조회
    const { data: business } = await db
      .from('businesses')
      .select('name, phone, naver_place_url, google_place_url')
      .eq('id', worker.business_id)
      .maybeSingle()

    if (!business) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // 서비스명 조회
    let cleaningType = '청소 서비스'
    if (booking.quote_id) {
      const { data: quote } = await db
        .from('quotes')
        .select('cleaning_type')
        .eq('id', booking.quote_id)
        .maybeSingle()
      if (quote?.cleaning_type) cleaningType = quote.cleaning_type
    }

    // 고객 DB 자동 upsert (전화번호 기준)
    if (booking.customer_phone?.trim()) {
      const { data: existing } = await db
        .from('customers')
        .select('id')
        .eq('business_id', worker.business_id)
        .eq('phone', booking.customer_phone)
        .maybeSingle()

      if (!existing) {
        await db.from('customers').insert({
          business_id: worker.business_id,
          name: booking.customer_name,
          phone: booking.customer_phone,
          address: booking.service_address ?? null,
          type: 'one_time',
        })
      }
    }

    // 영수증 발송 — 수금이 기록되는 이 지점이 유일한 자동 발송 자리다.
    //
    // 사장님이 누를 버튼을 따로 두지 않는다. 돈을 받았다고 기록하는 행동 자체가
    // 영수증을 보낼 이유이고, 이 시점엔 예약이 completed라 영수증 링크도 살아 있다.
    // (예전엔 '결제 요청' 시점에 영수증을 보내서 링크가 404였다.)
    //
    // 안 보내는 경우 세 가지:
    //   · 정기계약 방문 — 정기 거래처 카톡은 전날 안내·초도·월간 보고서 세 가지뿐
    //   · 계산서 청구 건 — 현장에서 받은 돈이 없으니 "결제 완료"는 거짓말이 된다
    //   · 수금액 0원 — 위와 같은 이유
    // 발송이 실패해도 수금 완료는 되돌리지 않는다(알림은 부가 기능).
    if (!bChk?.contract_id && !parsedInput.invoiceRequested && paid > 0 && booking.customer_phone) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
        await sendReceiptAlimtalk({
          customerPhone: booking.customer_phone,
          customerName:  booking.customer_name,
          businessName:  business.name,
          businessPhone: business.phone ?? null,
          cleaningType,
          completedAt:   booking.scheduled_at,
          paidAmount:    paid,
          receiptUrl:    `${appUrl}/q/${worker.business_id}/receipt/${parsedInput.bookingId}`,
        })
        await db
          .from('bookings')
          .update({ receipt_sent_at: new Date().toISOString() } as never)
          .eq('id', parsedInput.bookingId)
          .eq('business_id', worker.business_id)
      } catch (err) {
        console.error('[Field] 영수증 발송 실패:', err)
      }
    }

    // 리뷰 요청 발송 (skipReview=true면 생략, 실패해도 수금 완료는 유지)
    //
    // 크론(D+1·D+3)과 똑같이 인증 페이지(/review/토큰)로 보낸다.
    // 예전엔 여기서만 리뷰 사이트로 직접 보내서 발송·클릭·작성 기록이 하나도 안 남았고,
    // 담당 기사도 알 수 없었다. 같은 경로로 통일해야 집계와 성과급이 성립한다.
    // 정기계약 방문은 후기 요청 대상이 아니다 — 매 방문마다 조르는 꼴이 된다.
    // (정기 거래처 카톡은 방문 전날 안내·초도 보고서·월간 보고서 세 가지뿐)
    // 계산서 청구 건은 사장님이 이어받아야 한다 — 현장에서 끝나지 않는 유일한 마감이라 알림을 보낸다.
    // (실패해도 작업 완료는 유지 — 알림은 부가 기능)
    if (parsedInput.invoiceRequested) {
      const amount = Math.round(booking.final_price ?? 0)
      try {
        await sendPushToBusiness(worker.business_id, {
          title: '세금계산서 발행 요청',
          body: `${booking.customer_name} 현장 ${amount.toLocaleString('ko-KR')}원 — 현장에서 못 받았어요. 계산서 끊고 청구해주세요.`,
          url: '/dashboard/finance',
          tag: `invoice-${parsedInput.bookingId}`,
        })
      } catch (err) {
        console.error('[Field] 계산서 요청 알림 실패:', err)
      }
    }

    if (!parsedInput.skipReview && !booking.contract_id) {
      const reviewUrl = business.google_place_url || business.naver_place_url
      if (booking.customer_phone && reviewUrl) {
        try {
          const token = randomBytes(20).toString('hex')
          await db.from('review_claims').insert({
            booking_id:     parsedInput.bookingId,
            business_id:    worker.business_id,
            customer_phone: booking.customer_phone,
            token,
            is_followup:    false,
            worker_id:      worker.id,   // 현장에서 마감한 기사에게 귀속
          } as never)

          await sendReviewRequestAlimtalk({
            customerPhone: booking.customer_phone,
            customerName:  booking.customer_name ?? '고객',
            businessName:  business.name,
            cleaningType,
            reviewToken:   token,
            workerName:    worker.name ?? null,
            workerType:    worker.type ?? null,
          })

          // 크론이 다음 날 같은 요청을 또 보내지 않게 발송 기록을 남긴다
          await db
            .from('bookings')
            .update({ auto_review_sent_at: new Date().toISOString() } as never)
            .eq('id', parsedInput.bookingId)
        } catch (err) {
          console.error('[Field] 리뷰 요청 발송 실패:', err)
        }
      }
    }

    // 홍보 영상 대기열 — 정기 거래처는 보고서를 안 보내므로 여기가 유일한 지점이다.
    // 이미 대기 중이면 아무 일도 안 한다(발송 때 들어갔을 수 있다).
    await queueReelForBooking(db as unknown as SupabaseClient, worker.business_id, parsedInput.bookingId)

    return { success: true, reviewSkipped: !!parsedInput.skipReview }
  })

// 작업 전 현장 사진 저장 (메모와 함께 저장, 보고서에 자동 연결)
export const fieldSaveBeforePhotosAction = action
  .schema(z.object({
    workerId:        z.string().uuid(),
    bookingId:       z.string().uuid(),
    beforePhotoUrls: z.array(z.string().min(1)).max(10),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 보고서 upsert (없으면 생성)
    const { data: report, error: reportError } = await db
      .from('reports')
      .upsert({
        business_id: worker.business_id,
        booking_id:  parsedInput.bookingId,
      }, { onConflict: 'booking_id' })
      .select('id')
      .single()

    if (reportError || !report) throw new Error('[APP] 저장에 실패했어요')

    // 기존 before 사진만 삭제 후 재입력 (after 사진은 유지)
    await db.from('report_photos').delete().eq('report_id', report.id).eq('type', 'before')

    if (parsedInput.beforePhotoUrls.length > 0) {
      await db.from('report_photos').insert(
        parsedInput.beforePhotoUrls.map((url, i) => ({
          report_id:  report.id,
          url,
          type:       'before' as const,
          sort_order: i,
        }))
      )
    }

    return { success: true, reportId: report.id }
  })

// 보고서 저장 (사진 + 메모, 발송은 별도 액션)
export const fieldSaveReportAction = action
  .schema(z.object({
    workerId:        z.string().uuid(),
    bookingId:       z.string().uuid(),
    notes:           z.string().max(5000).optional(),
    preventiveNote:  z.string().max(2000).optional(), // 현장 특이사항 — 월말 거래처 보고서에 자동으로 모임
    beforePhotoUrls: z.array(z.string().min(1)).max(10),
    afterPhotoUrls:  z.array(z.string().min(1)).max(10),
    // 사진마다 '어디'인지 — 사진 배열과 같은 순서. 초도(첫) 방문에서만 받는다.
    // 사장님은 현장에 안 가므로 이 값이 없으면 초도 보고서를 만들 수 없다.
    beforePhotoCaptions: z.array(z.string().max(100)).max(10).optional(),
    afterPhotoCaptions:  z.array(z.string().max(100)).max(10).optional(),
    // 앞으로 손봐야 할 것 + 몇 달 뒤에 사장님께 알릴지(0이면 알림 없음)
    careAdvice:      z.string().max(2000).optional(),
    // 보고서를 만들면서 이미 다듬은 문장이면 여기서 또 다듬지 않는다(같은 글을 두 번 쓰는 낭비).
    careAdvicePolished: z.boolean().optional(),
    careMonths:      z.number().int().min(0).max(24).optional(),
    // 다음에 제안할 서비스 — 고객 문서엔 안 실린다. 대표가 승인하면 careMonths 뒤에 연락이 나간다.
    suggestedServices: z.array(z.string().min(1).max(60)).max(10).optional(),
    aiReportData:    z.object({
      beforeStatus: z.string(),
      workDetails: z.string(),
      afterResult: z.string(),
      additionalNotes: z.string(),
      recommendedServices: z.array(z.string()),
    }).optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 보고서 upsert
    const upsertData: Record<string, unknown> = {
      business_id: worker.business_id,
      booking_id:  parsedInput.bookingId,
      notes:       parsedInput.notes ?? null,
    }
    // 특이사항은 값이 넘어온 경우에만 반영 — 보고서 자동 정리 중간저장이 기존 메모를 지우지 않게
    if (parsedInput.preventiveNote !== undefined) {
      upsertData.preventive_note = parsedInput.preventiveNote.trim() || null
    }
    if (parsedInput.aiReportData) {
      upsertData.ai_report_data = parsedInput.aiReportData
    }
    // 다듬은 '앞으로 손봐야 할 것' — 고객에게 나가는 제안 문구도 이 문장을 쓴다
    let polishedAdvice: string | null = null

    // 향후 관리 안내 — 비우면 알림도 함께 지운다
    if (parsedInput.careAdvice !== undefined) {
      let advice = parsedInput.careAdvice.trim()

      // 이 글은 고객 문서(작업 보고서 '향후 관리 안내' · 월간 보고서 '다음 달 계획')에
      // **그대로 인쇄**된다. 일회성 현장은 보고서를 만들 때 같이 다듬지만, 정기 거래처 현장은
      // '오늘 한 작업'을 안 받아서 그 경로를 안 탄다 → 메모체가 그대로 거래처에 나갔다.
      // 여기서 한 번 더 걸러 양쪽을 같은 말투로 맞춘다.
      //
      // ⚠️ 내용이 실제로 바뀐 저장에서만 부른다. 매번 부르면 이미 다듬은 문장을 계속
      //    다시 쓰게 되고(문장이 조금씩 흔들린다), 저장할 때마다 돈과 시간이 든다.
      if (advice && !parsedInput.careAdvicePolished) {
        const { data: prev } = await db
          .from('reports')
          .select('care_advice')
          .eq('booking_id', parsedInput.bookingId)
          .maybeSingle() as { data: { care_advice: string | null } | null }

        if ((prev?.care_advice ?? '').trim() !== advice) {
          advice = await polishCareAdvice(advice)
        }
      }

      upsertData.care_advice = advice || null
      upsertData.care_due_at =
        advice && parsedInput.careMonths && parsedInput.careMonths > 0
          ? addMonths(parsedInput.careMonths)
          : null
      // 다듬은 문장을 아래 제안 문구에서도 써야 한다. 원문을 다시 읽으면 메모체가 그대로 나간다.
      polishedAdvice = advice
    }

    const { data: report, error: reportError } = await db
      .from('reports')
      .upsert(upsertData as never, { onConflict: 'booking_id' })
      .select('id')
      .single()

    if (reportError || !report) throw new Error('[APP] 보고서 저장에 실패했어요')

    // 기존 사진 삭제 후 재입력
    await db.from('report_photos').delete().eq('report_id', report.id)

    const allPhotos = [
      ...parsedInput.beforePhotoUrls.map((url, i) => ({
        report_id:  report.id,
        url,
        type:       'before' as const,
        sort_order: i,
        caption:    parsedInput.beforePhotoCaptions?.[i]?.trim() || null,
      })),
      ...parsedInput.afterPhotoUrls.map((url, i) => ({
        report_id:  report.id,
        url,
        type:       'after' as const,
        sort_order: i,
        caption:    parsedInput.afterPhotoCaptions?.[i]?.trim() || null,
      })),
    ]

    if (allPhotos.length > 0) {
      await db.from('report_photos').insert(allPhotos)
    }

    // 다음에 제안할 서비스 → 재방문 대기열(검토 대기).
    // 고객에게 지금 나가는 게 아니라 대표가 승인해야 움직인다.
    if (parsedInput.suggestedServices !== undefined) {
      // ⚠️ parsedInput.careAdvice(원문)를 쓰면 안 된다 — 그건 현장이 적은 메모체 그대로다.
      //    이 문장은 고객에게 나가는 안내에 그대로 실린다.
      const advice = (polishedAdvice ?? '').trim()
      const added = await syncFieldSuggestions({
        db: db as unknown as SupabaseClient,
        businessId: worker.business_id,
        bookingId: parsedInput.bookingId,
        reportId: report.id,
        workerId: worker.id,
        serviceNames: parsedInput.suggestedServices,
        reason: advice || null,
        dueAt:
          parsedInput.careMonths && parsedInput.careMonths > 0
            ? addMonths(parsedInput.careMonths)
            : null,
      })

      // 현장이 올린 걸 사장님이 모르면 대기열에서 그대로 늙는다 — 새로 생긴 것만 알린다
      if (added > 0) {
        await sendPushToBusiness(worker.business_id, {
          title: '현장에서 제안이 올라왔어요 💡',
          body: `${booking.customer_name}님 현장에 ${parsedInput.suggestedServices[0]}${added > 1 ? ` 외 ${added - 1}건` : ''}을 추천했어요. 확인하고 승인해주세요`,
          url: '/dashboard/reengagement',
          tag: 'field-suggestion',
        }).catch((e) => console.error('[Field] 제안 푸시 실패:', e))
      }
    }

    // 정기계약의 '첫 방문'이면 초도 리포트 초안을 만들어 둔다.
    // 직원이 따로 할 일은 없다 — 평소대로 저장하면 사장님 쪽에 초안이 기다리고 있게 된다.
    const draftCreated = await ensureOnboardingDraft({
      db: db as unknown as SupabaseClient,
      businessId: worker.business_id,
      bookingId: parsedInput.bookingId,
      contractId: booking.contract_id,
      reportId: report.id,
    })

    return { success: true, reportId: report.id, onboardingDraftCreated: draftCreated }
  })

// 보고서 발송 (검토 후 승인 시 호출)
export const fieldSendReportAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    reportId:  z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 아직 시작도 안 한 일정에는 보고서를 보내지 않는다.
    // ('진행 중'은 허용 — 수금 전이라 아직 완료로 안 넘어간 정상 상황이다)
    assertReportSendable(booking.status)

    // 정기계약 방문은 고객에게 작업 보고서를 보내지 않는다 — 월간 보고서로 한 번에 안내한다
    if (booking.contract_id) throw new Error('[APP] 정기 거래처엔 방문마다 보내지 않아요. 월간 보고서로 안내됩니다')

    if (!booking.customer_phone) throw new Error('[APP] 고객 연락처가 없어 발송할 수 없어요')

    // 업체 정보
    const { data: business } = await db
      .from('businesses')
      .select('name, phone')
      .eq('id', worker.business_id)
      .maybeSingle()

    if (!business) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // 서비스명
    let cleaningType = '청소 서비스'
    if (booking.quote_id) {
      const { data: quote } = await db
        .from('quotes')
        .select('cleaning_type')
        .eq('id', booking.quote_id)
        .maybeSingle()
      if (quote?.cleaning_type) cleaningType = quote.cleaning_type
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

    try {
      await sendWorkCompleteAlimtalk({
        customerPhone: booking.customer_phone,
        customerName:  booking.customer_name ?? '고객',
        businessName:  business.name,
        businessPhone: business.phone ?? null,
        cleaningType,
        scheduledAt:   booking.scheduled_at ?? '',
        reportUrl:     `${appUrl}/q/${worker.business_id}/report/${parsedInput.reportId}`,
      })
    } catch (err) {
      // 알림톡 발송 실패는 로그만 남기고 발송 완료 처리 (DB 기록은 항상 남김)
      console.error('[fieldSendReport] 알림톡 발송 실패:', err)
    }

    // 발송 시각 기록
    await db
      .from('reports')
      .update({ kakao_sent_at: new Date().toISOString() })
      .eq('id', parsedInput.reportId)

    // 홍보 영상 대기열에 넣는다 — 현장 직원은 아무것도 안 눌러도 된다.
    // 실제 제작은 크론이 하고, 완성되면 대표에게 알림이 간다.
    await queueReelForBooking(db as unknown as SupabaseClient, worker.business_id, parsedInput.bookingId)

    return { success: true }
  })

// 작업 중 영상 클립 저장 (릴스 제작용)
// reportId가 없어도 booking_id 기반 upsert로 보고서 자동 생성
export const fieldSaveWorkClipsAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    clipUrls:  z.array(z.string().min(1)).min(1).max(3),
    // 각 영상의 실제 길이(초) — clipUrls와 같은 순서. 릴스에서 화면 길이를 정하는 데 쓴다.
    clipDurations: z.array(z.number().min(0).max(600)).max(3).optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 보고서가 없으면 생성, 있으면 work_clip_urls만 업데이트
    const { data: existing } = await db
      .from('reports')
      .select('id')
      .eq('booking_id', parsedInput.bookingId)
      .eq('business_id', worker.business_id)
      .maybeSingle()

    if (existing) {
      const { error } = await db
        .from('reports')
        .update({
          work_clip_urls: parsedInput.clipUrls,
          work_clip_durations: parsedInput.clipDurations ?? null,
        } as never)
        .eq('id', existing.id)
      if (error) throw new Error('[APP] 영상 저장에 실패했어요')
    } else {
      const { error } = await db
        .from('reports')
        .insert({
          business_id: worker.business_id,
          booking_id: parsedInput.bookingId,
          work_clip_urls: parsedInput.clipUrls,
          work_clip_durations: parsedInput.clipDurations ?? null,
        } as never)
      if (error) throw new Error('[APP] 영상 저장에 실패했어요')
    }

    return { success: true }
  })

// 홍보 영상 제작은 여기 없다 — lib/reel/render.ts로 옮겼다.
// 현장 직원이 버튼을 눌러 1분을 기다리던 구조를 없앴고(홍보는 대표의 일이다),
// 지금은 보고서 발송·작업 완료 때 대기열에 들어가고 크론이 만든다.

// AI 보고서 자동 작성 (직원 메모 → 전문가 보고서 + 서비스 추천)
export const fieldGenerateAiReportAction = action
  .schema(z.object({
    workerId: z.string().uuid(),
    memo:     z.string().min(5, '메모를 5자 이상 입력해주세요').max(2000),
    serviceItems: z.array(z.object({
      name: z.string(),
      basePrice: z.number(),
    })).optional(),
    // '앞으로 손봐야 할 것'에 현장이 적은 원문 — 같이 다듬어 돌려준다.
    // 이 글은 고객 문서에 그대로 나가므로 메모체로 두면 서류 말투가 무너진다.
    careAdvice: z.string().max(2000).optional(),
  }))
  .action(async ({ parsedInput }) => {
    await verifyWorker(parsedInput.workerId)

    const result = await generateAiReport(
      parsedInput.memo,
      parsedInput.serviceItems,
      parsedInput.careAdvice,
    )
    return { success: true, report: result }
  })

// ── 현장 항목별 견적 편집 (2단계) ─────────────────────────
// 1단계(대시보드, booking-items.ts)와 동일한 테이블을 쓰되,
// 현장 직원이 수정하므로 이력에 changed_by:'worker' + 직원 이름을 남긴다.
type FieldDb = ReturnType<typeof createServiceClient>

interface FieldBookingItemRow {
  id: string
  name: string
  quantity: number
  unit_price: number
  amount: number
  unit: string
  sort_order: number
}

// 항목 합계로 bookings.final_price 동기화 (항목이 1개 이상일 때만)
async function syncFieldBookingTotal(db: FieldDb, businessId: string, bookingId: string) {
  const { data } = await db
    .from('booking_items' as never)
    .select('amount' as never)
    .eq('booking_id' as never, bookingId)
    .eq('business_id' as never, businessId) as { data: { amount: number }[] | null }

  const items = data ?? []
  if (items.length === 0) return // 항목이 없으면 기존 단일 금액 유지

  const total = items.reduce((s, it) => s + (it.amount ?? 0), 0)
  await db
    .from('bookings')
    .update({ final_price: total })
    .eq('id', bookingId)
    .eq('business_id', businessId)
}

// 현장 변경 이력 기록 (작업자 표시)
async function logFieldChange(
  db: FieldDb,
  businessId: string,
  bookingId: string,
  workerName: string,
  input: {
    change_type: 'add' | 'update' | 'remove'
    item_name: string | null
    old_amount: number | null
    new_amount: number | null
  },
) {
  await db.from('booking_price_changes' as never).insert({
    business_id: businessId,
    booking_id: bookingId,
    changed_by: 'worker',
    changed_by_name: workerName,
    change_type: input.change_type,
    item_name: input.item_name,
    old_amount: input.old_amount,
    new_amount: input.new_amount,
    reason: null,
  } as never)
}

// 항목 조회 (직원용) — 항목 + 변경 이력
export const fieldGetBookingItemsAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)

    // 하루 한도 — 사장님 화면과 같은 한도를 쓴다(현장에서 눌러도 같은 지갑에서 나간다)
    await spendQuota(db as unknown as SupabaseClient, 'report', worker.business_id)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const [itemsRes, changesRes] = await Promise.all([
      db.from('booking_items' as never)
        .select('id, name, quantity, unit_price, amount, unit, sort_order' as never)
        .eq('booking_id' as never, parsedInput.bookingId)
        .eq('business_id' as never, worker.business_id)
        .order('sort_order' as never, { ascending: true }) as unknown as Promise<{ data: FieldBookingItemRow[] | null }>,
      db.from('booking_price_changes' as never)
        .select('id, change_type, item_name, old_amount, new_amount, reason, changed_by, changed_by_name, created_at' as never)
        .eq('booking_id' as never, parsedInput.bookingId)
        .eq('business_id' as never, worker.business_id)
        .order('created_at' as never, { ascending: false }) as unknown as Promise<{
          data: {
            id: string; change_type: string; item_name: string | null
            old_amount: number | null; new_amount: number | null; reason: string | null
            changed_by: string; changed_by_name: string | null; created_at: string
          }[] | null
        }>,
    ])

    return { items: itemsRes.data ?? [], changes: changesRes.data ?? [] }
  })

// 항목 추가 (직원용)
export const fieldAddBookingItemAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    name:      z.string().min(1, '항목 이름을 입력해주세요'),
    quantity:  z.coerce.number().int().min(1, '수량은 1 이상이어야 합니다'),
    unitPrice: z.coerce.number().int().min(0, '0 이상의 금액을 입력해주세요'),
    amount:    z.coerce.number().int().min(0).optional(),
    unit:      z.string().optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const amount = parsedInput.amount ?? parsedInput.quantity * parsedInput.unitPrice

    const { error } = await db.from('booking_items' as never).insert({
      business_id: worker.business_id,
      booking_id: parsedInput.bookingId,
      name: parsedInput.name,
      quantity: parsedInput.quantity,
      unit_price: parsedInput.unitPrice,
      amount,
      unit: parsedInput.unit ?? '개',
      sort_order: Date.now() % 1000000,
    } as never)
    if (error) throw new Error('[APP] 항목 추가에 실패했어요')

    await logFieldChange(db, worker.business_id, parsedInput.bookingId, worker.name, {
      change_type: 'add', item_name: parsedInput.name, old_amount: null, new_amount: amount,
    })
    await syncFieldBookingTotal(db, worker.business_id, parsedInput.bookingId)

    return { success: true }
  })

// 항목 수정 (직원용)
export const fieldUpdateBookingItemAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    itemId:    z.string().uuid(),
    name:      z.string().min(1, '항목 이름을 입력해주세요'),
    quantity:  z.coerce.number().int().min(1, '수량은 1 이상이어야 합니다'),
    unitPrice: z.coerce.number().int().min(0, '0 이상의 금액을 입력해주세요'),
    amount:    z.coerce.number().int().min(0).optional(),
    unit:      z.string().optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const { data: prev } = await db
      .from('booking_items' as never)
      .select('name, amount' as never)
      .eq('id' as never, parsedInput.itemId)
      .eq('business_id' as never, worker.business_id)
      .maybeSingle() as { data: { name: string; amount: number } | null }
    if (!prev) throw new Error('[APP] 항목을 찾을 수 없어요')

    const amount = parsedInput.amount ?? parsedInput.quantity * parsedInput.unitPrice

    const { error } = await db
      .from('booking_items' as never)
      .update({
        name: parsedInput.name,
        quantity: parsedInput.quantity,
        unit_price: parsedInput.unitPrice,
        amount,
        ...(parsedInput.unit ? { unit: parsedInput.unit } : {}),
      } as never)
      .eq('id' as never, parsedInput.itemId)
      .eq('business_id' as never, worker.business_id)
    if (error) throw new Error('[APP] 항목 수정에 실패했어요')

    await logFieldChange(db, worker.business_id, parsedInput.bookingId, worker.name, {
      change_type: 'update', item_name: parsedInput.name, old_amount: prev.amount, new_amount: amount,
    })
    await syncFieldBookingTotal(db, worker.business_id, parsedInput.bookingId)

    return { success: true }
  })

// 항목 삭제 (직원용)
export const fieldDeleteBookingItemAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    itemId:    z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const { data: prev } = await db
      .from('booking_items' as never)
      .select('name, amount' as never)
      .eq('id' as never, parsedInput.itemId)
      .eq('business_id' as never, worker.business_id)
      .maybeSingle() as { data: { name: string; amount: number } | null }
    if (!prev) throw new Error('[APP] 항목을 찾을 수 없어요')

    const { error } = await db
      .from('booking_items' as never)
      .delete()
      .eq('id' as never, parsedInput.itemId)
      .eq('business_id' as never, worker.business_id)
    if (error) throw new Error('[APP] 항목 삭제에 실패했어요')

    await logFieldChange(db, worker.business_id, parsedInput.bookingId, worker.name, {
      change_type: 'remove', item_name: prev.name, old_amount: prev.amount, new_amount: null,
    })
    await syncFieldBookingTotal(db, worker.business_id, parsedInput.bookingId)

    return { success: true }
  })

// ── 현장 문단속(오픈/마감) 인증 ────────────────────────────
// 도착해서 문 열 때 오픈 사진, 다 끝내고 잠근 뒤 마감 사진을 올린다.
// 오픈 사진 시각(checkin_at)이 알림 기준점이 되고, 마감 사진이 없으면 크론이 알림을 보낸다.

// GPS 좌표(선택) — 직원이 사진 올릴 때의 현재 위치. 막지 않고 기록·표시만 한다.
const geoSchema = {
  lat: z.number().optional(),
  lng: z.number().optional(),
  acc: z.number().optional(),
}

// 도착·문 오픈 사진 저장 (checkin_at을 최초 1회만 기록 = 출근 기준점, + GPS 위치)
export const fieldSaveOpenPhotosAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    photoUrls: z.array(z.string().url()).max(5),
    ...geoSchema,
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 사진이 처음 올라올 때만 checkin_at 기록 (재업로드로 기준점이 밀리지 않게)
    const { data: cur } = await db
      .from('bookings')
      .select('checkin_at, site_lat, service_address' as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', worker.business_id)
      .maybeSingle() as unknown as { data: { checkin_at: string | null; site_lat: number | null; service_address: string | null } | null }

    const patch: Record<string, unknown> = { open_photo_urls: parsedInput.photoUrls }
    if (parsedInput.photoUrls.length > 0 && !cur?.checkin_at) {
      patch.checkin_at = new Date().toISOString()
    }
    // 직원 도착 위치 기록 (좌표가 넘어온 경우만)
    if (typeof parsedInput.lat === 'number' && typeof parsedInput.lng === 'number') {
      patch.checkin_lat = parsedInput.lat
      patch.checkin_lng = parsedInput.lng
      patch.checkin_acc = parsedInput.acc ?? null
    }
    // 현장 좌표가 아직 없으면 주소를 1회 지오코딩해 캐시 (거리 계산용, 실패해도 무시)
    if (!cur?.site_lat && cur?.service_address) {
      try {
        const site = await geocodeAddress(cur.service_address)
        if (site) {
          patch.site_lat = site.lat
          patch.site_lng = site.lng
        }
      } catch (e) {
        console.error('[Field] 현장 지오코딩 실패:', e)
      }
    }

    const { error } = await db
      .from('bookings')
      .update(patch as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', worker.business_id)
    if (error) throw new Error('[APP] 사진 저장에 실패했어요. 다시 시도해주세요')

    return { success: true, checkinAt: (patch.checkin_at as string) ?? cur?.checkin_at ?? null }
  })

// 마감·문 잠금 사진 저장 (checkout_at 기록 = 문단속 완료, + GPS 위치)
export const fieldSaveLockupPhotosAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    photoUrls: z.array(z.string().url()).max(5),
    ...geoSchema,
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 사진이 하나라도 있으면 마감 완료로 보고 checkout_at 기록, 모두 지우면 해제
    const done = parsedInput.photoUrls.length > 0
    const patch: Record<string, unknown> = {
      lockup_photo_urls: parsedInput.photoUrls,
      checkout_at: done ? new Date().toISOString() : null,
    }
    if (done && typeof parsedInput.lat === 'number' && typeof parsedInput.lng === 'number') {
      patch.checkout_lat = parsedInput.lat
      patch.checkout_lng = parsedInput.lng
      patch.checkout_acc = parsedInput.acc ?? null
    }
    const { error } = await db
      .from('bookings')
      .update(patch as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', worker.business_id)
    if (error) throw new Error('[APP] 사진 저장에 실패했어요. 다시 시도해주세요')

    return { success: true, done }
  })

// 작업 매뉴얼 체크리스트 — 항목별 사진 저장 (bookings.checklist_photos JSONB에 항목만 교체)
export const fieldSaveChecklistPhotosAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    itemId:    z.string().min(1).max(64),
    photoUrls: z.array(z.string().url()).max(5),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const { data: cur } = await db
      .from('bookings')
      .select('checklist_photos' as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', worker.business_id)
      .maybeSingle() as unknown as { data: { checklist_photos: Record<string, string[]> | null } | null }

    const progress: Record<string, string[]> = { ...(cur?.checklist_photos ?? {}) }
    if (parsedInput.photoUrls.length > 0) progress[parsedInput.itemId] = parsedInput.photoUrls
    else delete progress[parsedInput.itemId]

    const { error } = await db
      .from('bookings')
      .update({ checklist_photos: progress } as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', worker.business_id)
    if (error) throw new Error('[APP] 사진 저장에 실패했어요. 다시 시도해주세요')

    return { success: true }
  })

// ── 금일 특이사항 (정기 거래처 현장) ──────────────────────────────────────────
//
// 왜 이 액션이 필요한가:
// 정기 현장은 매일 하는 작업이 똑같다. 그래서 '오늘 한 작업'을 매일 적게 하면 아무도 안 쓴다.
// 거래처가 월간 보고서에서 실제로 보는 건 "무슨 문제가 있었고, 어떻게 했고, 해결됐나"다.
// 그 한 덩어리를 현장에서 바로 남기게 한다.
//
// ★새 테이블을 만들지 않고 claims에 쌓는다 — 월간 보고서 '요청·처리 내역',
//   홈 '미해결 클레임' 타일, 대표 알림이 전부 이미 claims를 보고 동작한다.
//   여기에 얹으면 그 세 곳이 공짜로 따라온다. ⛔별도 표를 새로 만들지 말 것.
export const fieldAddSiteIssueAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    title:     z.string().min(1, '무슨 일인지 한 줄로 적어주세요').max(120),
    content:   z.string().max(2000).optional(),
    /** 어떻게 했는지 — 적었으면 그 자리에서 해결된 것으로 본다 */
    resolution: z.string().max(2000).optional(),
    photoUrls:           z.array(z.string().url()).max(10).optional(),
    resolutionPhotoUrls: z.array(z.string().url()).max(10).optional(),
    /** 월간 보고서까지 못 기다리는 건 — 사장님 폰으로 바로 알림 */
    isUrgent:  z.boolean(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const looseDb = db as unknown as SupabaseClient
    const resolution = parsedInput.resolution?.trim() || null
    const now = new Date().toISOString()

    const { data: created, error } = await looseDb
      .from('claims')
      .insert({
        business_id:    worker.business_id,
        booking_id:     parsedInput.bookingId,
        customer_name:  booking.customer_name,
        customer_phone: booking.customer_phone,
        title:          parsedInput.title.trim(),
        content:        parsedInput.content?.trim() || null,
        photo_urls:            parsedInput.photoUrls ?? [],
        resolution,
        resolution_photo_urls: parsedInput.resolutionPhotoUrls ?? [],
        is_urgent:      parsedInput.isUrgent,
        // 현장에서 이미 처리했으면 열어둘 이유가 없다 — 사장님 '할 일'만 늘어난다
        status:         resolution ? 'resolved' : 'open',
        resolved_at:    resolution ? now : null,
        created_by_worker_id: worker.id,
      })
      .select('id')
      .maybeSingle() as unknown as { data: { id: string } | null; error: unknown }

    if (error) {
      console.error('[Field] 특이사항 등록 실패:', error)
      throw new Error('[APP] 등록하지 못했어요. 다시 눌러주세요')
    }

    // 급한 건만 즉시 알린다. 전부 알리면 알림이 흔해져서 정작 급한 걸 놓친다.
    if (parsedInput.isUrgent) {
      await sendPushToBusiness(worker.business_id, {
        title: `급한 특이사항 · ${booking.customer_name}`,
        body: `${worker.name} 기사님 — ${parsedInput.title.trim()}`,
        url: '/dashboard/claims',
        tag: `site-issue-${created?.id ?? parsedInput.bookingId}`,
      }).catch((e) => console.error('[Field] 특이사항 푸시 실패:', e))
    }

    return { success: true, claimId: created?.id ?? null }
  })

/**
 * 사장님이 접수한 클레임을 현장에서 처리 완료로 남긴다.
 *
 * 왜 '새 특이사항'이 아니라 이 액션인가: 같은 문제를 현장에서 다시 등록하면 한 건이 두 건이 된다.
 * 사장님 화면에는 미해결 하나 + 처리됨 하나가 남아, 결국 사장님이 손으로 정리해야 한다.
 * 그래서 원래 건에 처리 내용을 채운다.
 */
export const fieldResolveClaimAction = action
  .schema(z.object({
    workerId:   z.string().uuid(),
    bookingId:  z.string().uuid(),
    claimId:    z.string().uuid(),
    resolution: z.string().min(1, '어떻게 했는지 한 줄로 적어주세요').max(2000),
    /** 처리 후 사진 — 선택. 거래처는 '정말 됐나'를 사진으로 본다 */
    resolutionPhotoUrls: z.array(z.string().url()).max(3).optional(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const looseDb = db as unknown as SupabaseClient
    const now = new Date().toISOString()

    // ★ 월간 보고서는 '이 거래처의 이번 달 방문에 붙은 클레임'만 가져온다(claims.booking_id 기준).
    //   사장님이 클레임 화면에서 등록하면 booking_id가 비어 있을 수 있는데, 그대로 두면
    //   현장에서 처리해도 거래처 보고서에 한 줄도 안 남는다 — 처리한 방문에 붙여준다.
    const { data: claim } = (await looseDb
      .from('claims')
      .select('booking_id')
      .eq('id', parsedInput.claimId)
      .eq('business_id', worker.business_id)
      .maybeSingle()) as unknown as { data: { booking_id: string | null } | null }

    const { error } = await looseDb
      .from('claims')
      .update({
        resolution:  parsedInput.resolution.trim(),
        status:      'resolved',
        resolved_at: now,
        ...(parsedInput.resolutionPhotoUrls?.length
          ? { resolution_photo_urls: parsedInput.resolutionPhotoUrls }
          : {}),
        ...(claim && !claim.booking_id ? { booking_id: parsedInput.bookingId } : {}),
      })
      .eq('id', parsedInput.claimId)
      // 남의 업체 건을 못 건드리게 — workerId만 믿지 않는다
      .eq('business_id', worker.business_id)

    if (error) {
      console.error('[Field] 클레임 처리 실패:', error)
      throw new Error('[APP] 저장하지 못했어요. 다시 눌러주세요')
    }

    // 고객 불만이 해결됐다는 건 사장님이 바로 알아야 한다 — 고객에게 답을 줘야 하기 때문이다
    await sendPushToBusiness(worker.business_id, {
      title: `클레임 처리 완료 · ${booking.customer_name}`,
      body: `${worker.name} 기사님 — ${parsedInput.resolution.trim().slice(0, 60)}`,
      url: '/dashboard/claims',
      tag: `claim-resolved-${parsedInput.claimId}`,
    }).catch((e) => console.error('[Field] 클레임 처리 푸시 실패:', e))

    return { success: true }
  })

/** 이 방문에서 현장이 올린 특이사항 — 화면에 목록으로 되돌려 보여준다 */
export const fieldListSiteIssuesAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const { data } = await (db as unknown as SupabaseClient)
      .from('claims')
      .select('id, title, content, resolution, photo_urls, resolution_photo_urls, is_urgent, status, created_at')
      .eq('booking_id', parsedInput.bookingId)
      .not('created_by_worker_id', 'is', null)
      .order('created_at', { ascending: true })

    return { issues: data ?? [] }
  })
