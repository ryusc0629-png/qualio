'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendReceiptAlimtalk } from '@/lib/kakao/alimtalk'

// 사장님이 완료된 예약에 대해 영수증 발송을 트리거하는 액션
export const sendReceiptAction = action
  .schema(z.object({
    bookingId: z.string().uuid(),
  }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // 예약 조회 — 본인 업체 & 완료 상태만 허용
    const { data: booking } = await db
      .from('bookings')
      .select('id, customer_name, customer_phone, final_price, scheduled_at, status, quote_id')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', profile.business_id)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')
    if (booking.status !== 'completed') throw new Error('[APP] 완료된 예약에만 영수증을 발송할 수 있어요')
    if (!booking.customer_phone) throw new Error('[APP] 고객 연락처가 없어 발송할 수 없어요')

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

    const { data: business } = await db
      .from('businesses')
      .select('name, phone')
      .eq('id', profile.business_id)
      .maybeSingle()

    if (!business) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
    const receiptUrl = `${appUrl}/q/${profile.business_id}/receipt/${booking.id}`

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

    return { success: true, receiptUrl }
  })
