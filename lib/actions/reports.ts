'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendWorkCompleteAlimtalk, sendReviewRequestAlimtalk } from '@/lib/kakao/alimtalk'
import { revalidatePath } from 'next/cache'

const saveReportSchema = z.object({
  bookingId:       z.string().uuid(),
  notes:           z.string().max(2000).optional(),
  beforePhotoUrls: z.array(z.string().min(1)).max(5),
  afterPhotoUrls:  z.array(z.string().min(1)).max(5),
  sendAlimtalk:    z.boolean(),
})

export const saveReportAction = action
  .schema(saveReportSchema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .single()

    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { bookingId, notes, beforePhotoUrls, afterPhotoUrls, sendAlimtalk } = parsedInput

    // 예약이 이 업체 소속인지 확인
    const { data: booking } = await db
      .from('bookings')
      .select('id, customer_name, customer_phone, scheduled_at, service_address, quotes!quote_id(cleaning_type), businesses!business_id(name, phone)')
      .eq('id', bookingId)
      .eq('business_id', profile.business_id)
      .single()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

    // 보고서 upsert (booking_id unique 제약)
    const { data: report, error: reportError } = await db
      .from('reports')
      .upsert({
        business_id: profile.business_id,
        booking_id:  bookingId,
        notes:       notes ?? null,
        ...(sendAlimtalk ? { kakao_sent_at: new Date().toISOString() } : {}),
      }, { onConflict: 'booking_id' })
      .select('id')
      .single()

    if (reportError || !report) {
      console.error('[Reports] upsert 실패:', reportError)
      throw new Error('[APP] 보고서 저장에 실패했습니다')
    }

    // 기존 사진 삭제 후 재입력
    await db.from('report_photos').delete().eq('report_id', report.id)

    const allPhotos = [
      ...beforePhotoUrls.map((url, i) => ({
        report_id:  report.id,
        url,
        type:       'before' as const,
        sort_order: i,
      })),
      ...afterPhotoUrls.map((url, i) => ({
        report_id:  report.id,
        url,
        type:       'after' as const,
        sort_order: i,
      })),
    ]

    if (allPhotos.length > 0) {
      const { error: photoError } = await db.from('report_photos').insert(allPhotos)
      if (photoError) {
        console.error('[Reports] photos insert 실패:', photoError)
      }
    }

    // 알림톡 발송
    if (sendAlimtalk && booking.customer_phone) {
      const biz   = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
      const quote = Array.isArray(booking.quotes)     ? booking.quotes[0]     : booking.quotes
      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.kr'

      try {
        await sendWorkCompleteAlimtalk({
          customerPhone: booking.customer_phone,
          customerName:  booking.customer_name ?? '고객',
          businessName:  (biz as { name: string; phone: string | null } | null)?.name ?? '',
          businessPhone: (biz as { name: string; phone: string | null } | null)?.phone ?? null,
          cleaningType:  (quote as { cleaning_type: string | null } | null)?.cleaning_type ?? '청소 서비스',
          scheduledAt:   booking.scheduled_at ?? '',
          reportUrl:     `${appBaseUrl}/q/${profile.business_id}/report/${report.id}`,
        })
      } catch (err) {
        console.error('[Reports] alimtalk 발송 실패:', err)
      }
    }

    revalidatePath('/dashboard/work')
    revalidatePath('/dashboard/schedule')
    return { reportId: report.id }
  })

const sendReviewSchema = z.object({
  reportId: z.string().uuid(),
})

export const sendReviewRequestAction = action
  .schema(sendReviewSchema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .single()

    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // 보고서 + 예약 + 업체 정보 조회
    const { data: report } = await db
      .from('reports')
      .select('id, bookings!booking_id(customer_name, customer_phone, quotes!quote_id(cleaning_type)), businesses!business_id(name, naver_place_url)')
      .eq('id', parsedInput.reportId)
      .eq('business_id', profile.business_id)
      .single()

    if (!report) throw new Error('[APP] 보고서 정보를 찾을 수 없습니다')

    const booking = Array.isArray(report.bookings) ? report.bookings[0] : report.bookings
    const biz     = Array.isArray(report.businesses) ? report.businesses[0] : report.businesses
    const bizInfo = biz as { name: string; naver_place_url: string | null } | null
    const bookingInfo = booking as { customer_name: string | null; customer_phone: string | null; quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null } | null
    const quote   = Array.isArray(bookingInfo?.quotes) ? bookingInfo?.quotes[0] : bookingInfo?.quotes

    if (!bizInfo?.naver_place_url) throw new Error('[APP] 설정에서 네이버 플레이스 URL을 먼저 등록해주세요')
    if (!bookingInfo?.customer_phone) throw new Error('[APP] 고객 연락처가 없습니다')

    await sendReviewRequestAlimtalk({
      customerPhone: bookingInfo.customer_phone,
      customerName:  bookingInfo.customer_name ?? '고객',
      businessName:  bizInfo.name,
      cleaningType:  (quote as { cleaning_type: string | null } | null)?.cleaning_type ?? '청소 서비스',
      reviewUrl:     bizInfo.naver_place_url,
    })

    // 리뷰 요청 발송 시각 기록
    await db
      .from('reports')
      .update({ review_request_sent_at: new Date().toISOString() })
      .eq('id', parsedInput.reportId)

    return { success: true }
  })
