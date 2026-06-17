'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import {
  sendReceiptAlimtalk,
  sendReviewRequestAlimtalk,
  sendWorkCompleteAlimtalk,
} from '@/lib/kakao/alimtalk'
import { generateAiReport } from '@/lib/ai/report-writer'

// workers 테이블 타입 (Supabase 타입 아직 미생성)
interface WorkerRow {
  id: string
  business_id: string
  name: string
  is_active: boolean
}

interface BookingRow {
  id: string
  business_id: string
  worker_id: string
  customer_name: string
  customer_phone: string | null
  service_address: string | null
  scheduled_at: string
  final_price: number
  status: string
  memo: string | null
  quote_id: string | null
}

// 직원 인증 — workerId로 직원과 업체 정보를 한 번에 검증
async function verifyWorker(workerId: string) {
  const db = createServiceClient()
  const { data: worker } = await db
    .from('workers' as never)
    .select('id, business_id, name, is_active' as never)
    .eq('id' as never, workerId)
    .maybeSingle() as { data: WorkerRow | null }

  if (!worker) throw new Error('[APP] 직원 정보를 찾을 수 없습니다')
  if (!worker.is_active) throw new Error('[APP] 비활성 계정입니다. 사장님께 문의해주세요')

  return { db, worker }
}

// 직원에게 배정된 예약인지 확인
async function verifyBookingOwnership(
  db: ReturnType<typeof createServiceClient>,
  bookingId: string,
  workerId: string,
  businessId: string,
) {
  const { data: booking } = await db
    .from('bookings')
    .select('id, business_id, customer_name, customer_phone, service_address, scheduled_at, final_price, status, memo, quote_id')
    .eq('id', bookingId)
    .eq('business_id', businessId)
    .eq('worker_id' as never, workerId)
    .maybeSingle() as { data: BookingRow | null }

  if (!booking) throw new Error('[APP] 배정된 작업이 아니거나 존재하지 않습니다')
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

    // 1. 현장 특이사항 → bookings.memo
    if (parsedInput.siteMemo !== undefined) {
      await db
        .from('bookings')
        .update({ memo: parsedInput.siteMemo || null })
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

// 결제 요청 (고객에게 영수증 알림톡 발송)
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
    const receiptUrl = `${appUrl}/q/${worker.business_id}/receipt/${booking.id}`

    await sendReceiptAlimtalk({
      customerPhone: booking.customer_phone,
      customerName:  booking.customer_name,
      businessName:  business.name,
      businessPhone: business.phone ?? null,
      cleaningType,
      completedAt:   booking.scheduled_at,
      paidAmount:    booking.final_price,
      receiptUrl,
    })

    return { success: true }
  })

// 수금 완료 (in_progress → completed) + 리뷰 자동 발송
export const fieldCompletePaymentAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    if (booking.status !== 'in_progress') {
      throw new Error('[APP] 작업 중인 예약만 수금 완료할 수 있어요')
    }

    // 상태 → completed
    const { error } = await db
      .from('bookings')
      .update({ status: 'completed' })
      .eq('id', parsedInput.bookingId)

    if (error) throw new Error('[APP] 상태 변경에 실패했어요')

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

    // 리뷰 요청 발송 (실패해도 수금 완료는 유지)
    const reviewUrl = business.google_place_url || business.naver_place_url
    if (booking.customer_phone && reviewUrl) {
      try {
        await sendReviewRequestAlimtalk({
          customerPhone: booking.customer_phone,
          customerName:  booking.customer_name ?? '고객',
          businessName:  business.name,
          cleaningType,
          reviewUrl,
        })
      } catch (err) {
        console.error('[Field] 리뷰 요청 발송 실패:', err)
      }
    }

    return { success: true }
  })

// 작업 전 현장 사진 저장 (메모와 함께 저장, 보고서에 자동 연결)
export const fieldSaveBeforePhotosAction = action
  .schema(z.object({
    workerId:        z.string().uuid(),
    bookingId:       z.string().uuid(),
    beforePhotoUrls: z.array(z.string().min(1)).max(5),
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
    beforePhotoUrls: z.array(z.string().min(1)).max(5),
    afterPhotoUrls:  z.array(z.string().min(1)).max(5),
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
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 보고서 upsert
    const upsertData: Record<string, unknown> = {
      business_id: worker.business_id,
      booking_id:  parsedInput.bookingId,
      notes:       parsedInput.notes ?? null,
    }
    if (parsedInput.aiReportData) {
      upsertData.ai_report_data = parsedInput.aiReportData
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
      })),
      ...parsedInput.afterPhotoUrls.map((url, i) => ({
        report_id:  report.id,
        url,
        type:       'after' as const,
        sort_order: i,
      })),
    ]

    if (allPhotos.length > 0) {
      await db.from('report_photos').insert(allPhotos)
    }

    return { success: true, reportId: report.id }
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

    await sendWorkCompleteAlimtalk({
      customerPhone: booking.customer_phone,
      customerName:  booking.customer_name ?? '고객',
      businessName:  business.name,
      businessPhone: business.phone ?? null,
      cleaningType,
      scheduledAt:   booking.scheduled_at ?? '',
      reportUrl:     `${appUrl}/q/${worker.business_id}/report/${parsedInput.reportId}`,
    })

    // 발송 시각 기록
    await db
      .from('reports')
      .update({ kakao_sent_at: new Date().toISOString() })
      .eq('id', parsedInput.reportId)

    return { success: true }
  })

// 작업 중 영상 클립 저장 (릴스 제작용)
export const fieldSaveWorkClipsAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    reportId:  z.string().uuid(),
    clipUrls:  z.array(z.string().min(1)).min(3).max(3),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    const { error } = await db
      .from('reports')
      .update({ work_clip_urls: parsedInput.clipUrls } as never)
      .eq('id', parsedInput.reportId)
      .eq('business_id', worker.business_id)

    if (error) throw new Error('[APP] 영상 저장에 실패했어요')
    return { success: true }
  })

// 릴스 편집 요청 (Creatomate API 호출)
export const fieldRequestReelAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    reportId:  z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)
    const booking = await verifyBookingOwnership(db, parsedInput.bookingId, worker.id, worker.business_id)

    // 보고서 + 사진 + 클립 조회
    const { data: report } = await db
      .from('reports')
      .select('id, work_clip_urls, notes, report_photos(url, type, sort_order)' as never)
      .eq('id', parsedInput.reportId)
      .eq('business_id', worker.business_id)
      .maybeSingle() as {
        data: {
          id: string
          work_clip_urls: string[]
          notes: string | null
          report_photos: { url: string; type: string; sort_order: number }[]
        } | null
      }

    if (!report) throw new Error('[APP] 보고서를 찾을 수 없어요')

    const clips = report.work_clip_urls ?? []
    if (clips.length < 3) throw new Error('[APP] 작업 중 영상 3개를 모두 올려주세요')

    const beforePhotos = report.report_photos
      .filter((p) => p.type === 'before')
      .sort((a, b) => a.sort_order - b.sort_order)
    const afterPhotos = report.report_photos
      .filter((p) => p.type === 'after')
      .sort((a, b) => a.sort_order - b.sort_order)

    if (!beforePhotos[0]) throw new Error('[APP] 작업 전 사진이 필요해요')
    if (!afterPhotos[0]) throw new Error('[APP] 작업 후 사진이 필요해요')

    const { data: business } = await db
      .from('businesses')
      .select('name')
      .eq('id', worker.business_id)
      .maybeSingle()

    if (!business) throw new Error('[APP] 업체 정보를 찾을 수 없어요')

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
    const { requestReelRender } = await import('@/lib/creatomate/client')

    const renderId = await requestReelRender({
      beforePhotoUrl: beforePhotos[0].url,
      clipUrls: [clips[0], clips[1], clips[2]],
      afterPhotoUrl: afterPhotos[0].url,
      businessName: business.name,
      beforeText: booking.memo ?? '작업 전 현장',
      webhookUrl: `${appUrl}/api/creatomate/webhook`,
    })

    const { error } = await db
      .from('reports')
      .update({ reel_status: 'processing', reel_render_id: renderId } as never)
      .eq('id', parsedInput.reportId)

    if (error) throw new Error('[APP] 릴스 요청 저장에 실패했어요')
    return { success: true }
  })

// AI 보고서 자동 작성 (직원 메모 → 전문가 보고서 + 서비스 추천)
export const fieldGenerateAiReportAction = action
  .schema(z.object({
    workerId: z.string().uuid(),
    memo:     z.string().min(5, '메모를 5자 이상 입력해주세요').max(2000),
    serviceItems: z.array(z.object({
      name: z.string(),
      basePrice: z.number(),
    })).optional(),
  }))
  .action(async ({ parsedInput }) => {
    await verifyWorker(parsedInput.workerId)

    const result = await generateAiReport(parsedInput.memo, parsedInput.serviceItems)
    return { success: true, report: result }
  })
