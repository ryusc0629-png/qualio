'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendReceiptAlimtalk,
  sendReviewRequestAlimtalk,
  sendWorkCompleteAlimtalk,
} from '@/lib/kakao/alimtalk'
import { sendOnMyWayForBooking } from '@/lib/kakao/on-my-way'
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
  worker_id: string | null
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
      .select('id, business_id, customer_name, customer_phone, service_address, scheduled_at, final_price, status, memo, quote_id')
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

// 수금 완료 (in_progress → completed) + 리뷰 자동 발송 (skipReview=true면 발송 생략)
export const fieldCompletePaymentAction = action
  .schema(z.object({
    workerId:   z.string().uuid(),
    bookingId:  z.string().uuid(),
    skipReview: z.boolean().optional(),
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

    // 리뷰 요청 발송 (skipReview=true면 생략, 실패해도 수금 완료는 유지)
    if (!parsedInput.skipReview) {
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
    }

    return { success: true, reviewSkipped: !!parsedInput.skipReview }
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

    return { success: true }
  })

// 작업 중 영상 클립 저장 (릴스 제작용)
// reportId가 없어도 booking_id 기반 upsert로 보고서 자동 생성
export const fieldSaveWorkClipsAction = action
  .schema(z.object({
    workerId:  z.string().uuid(),
    bookingId: z.string().uuid(),
    clipUrls:  z.array(z.string().min(1)).min(1).max(3),
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
        .update({ work_clip_urls: parsedInput.clipUrls } as never)
        .eq('id', existing.id)
      if (error) throw new Error('[APP] 영상 저장에 실패했어요')
    } else {
      const { error } = await db
        .from('reports')
        .insert({
          business_id: worker.business_id,
          booking_id: parsedInput.bookingId,
          work_clip_urls: parsedInput.clipUrls,
        } as never)
      if (error) throw new Error('[APP] 영상 저장에 실패했어요')
    }

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

    // 보고서 + 사진 + 클립 + AI 보고서 데이터(자막 생성용) 조회
    const { data: report } = await db
      .from('reports')
      .select('id, work_clip_urls, notes, ai_report_data, report_photos(url, type, sort_order)' as never)
      .eq('id', parsedInput.reportId)
      .eq('business_id', worker.business_id)
      .maybeSingle() as {
        data: {
          id: string
          work_clip_urls: string[]
          notes: string | null
          ai_report_data: {
            beforeStatus?: string
            workDetails?: string
            afterResult?: string
          } | null
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

    // 서비스명 (자막 맥락용)
    let cleaningType = '청소 서비스'
    if (booking.quote_id) {
      const { data: quote } = await db
        .from('quotes')
        .select('cleaning_type')
        .eq('id', booking.quote_id)
        .maybeSingle()
      if (quote?.cleaning_type) cleaningType = quote.cleaning_type
    }

    // 작업 보고서 기반으로 짧은 후킹 자막 생성 (시청 지속 ↑)
    const { generateReelCaptions } = await import('@/lib/ai/reel-captions')
    const captions = await generateReelCaptions({
      cleaningType,
      beforeStatus: report.ai_report_data?.beforeStatus ?? booking.memo ?? '',
      workDetails: report.ai_report_data?.workDetails ?? '',
      afterResult: report.ai_report_data?.afterResult ?? '',
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
    const { requestReelRender } = await import('@/lib/creatomate/client')

    const renderId = await requestReelRender({
      beforePhotoUrl: beforePhotos[0].url,
      clipUrls: [clips[0], clips[1], clips[2]],
      afterPhotoUrl: afterPhotos[0].url,
      businessName: business.name,
      beforeText: booking.memo ?? '작업 전 현장',
      captions,
      webhookUrl: `${appUrl}/api/creatomate/webhook`,
    })

    const { error } = await db
      .from('reports')
      .update({ reel_status: 'processing', reel_render_id: renderId } as never)
      .eq('id', parsedInput.reportId)

    if (error) throw new Error('[APP] 릴스 요청 저장에 실패했어요')
    return { success: true }
  })

// 릴스 편집 상태 조회 — 현장 앱에서 '처리 중'일 때 폴링용
export const fieldGetReelStatusAction = action
  .schema(z.object({
    workerId: z.string().uuid(),
    reportId: z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const { db, worker } = await verifyWorker(parsedInput.workerId)

    const { data: report } = await db
      .from('reports')
      .select('reel_status, reel_url' as never)
      .eq('id', parsedInput.reportId)
      .eq('business_id', worker.business_id)
      .maybeSingle() as { data: { reel_status: string | null; reel_url: string | null } | null }

    if (!report) throw new Error('[APP] 보고서를 찾을 수 없어요')

    return {
      reelStatus: report.reel_status ?? 'idle',
      reelUrl: report.reel_url ?? null,
    }
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
