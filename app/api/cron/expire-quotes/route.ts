import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReminderAlimtalk } from '@/lib/kakao/alimtalk'

// Vercel Cron: 매일 09:00 UTC (한국 오후 6시) 실행
// 1) pending 상태에서 48시간이 지난 견적을 expired로 일괄 변경
// 2) 내일 방문 예정인 예약에 리마인더 알림톡 발송

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // 1) 만료 처리
  const expiryThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: expiredData, error: expireError } = await db
    .from('quotes')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('created_at', expiryThreshold)
    .select('id')

  if (expireError) {
    console.error('[Cron] expire-quotes 실패:', expireError)
    return NextResponse.json({ error: expireError.message }, { status: 500 })
  }
  const expired = expiredData?.length ?? 0
  console.log(`[Cron] expire-quotes 완료: ${expired}건 만료 처리`)

  // 2) 내일 방문 예약 리마인더 발송 (KST 기준 내일 00:00 ~ 23:59)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const tomorrowKST = new Date(nowKST)
  tomorrowKST.setUTCDate(nowKST.getUTCDate() + 1)
  tomorrowKST.setUTCHours(0, 0, 0, 0)
  const rangeStart = new Date(tomorrowKST.getTime() - 9 * 60 * 60 * 1000)
  const rangeEnd   = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000)

  const { data: bookings } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, scheduled_at, service_address, businesses!business_id(name, phone), quotes!quote_id(cleaning_type)')
    .eq('status', 'confirmed')
    .gte('scheduled_at', rangeStart.toISOString())
    .lt('scheduled_at', rangeEnd.toISOString())

  let reminderSent = 0
  for (const booking of bookings ?? []) {
    const biz   = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
    const quote = Array.isArray(booking.quotes)     ? booking.quotes[0]     : booking.quotes
    if (!booking.customer_phone || !booking.scheduled_at || !biz) continue
    try {
      await sendReminderAlimtalk({
        customerPhone:  booking.customer_phone,
        customerName:   booking.customer_name ?? '고객',
        businessName:   biz.name,
        businessPhone:  biz.phone ?? null,
        cleaningType:   quote?.cleaning_type ?? '청소 서비스',
        scheduledAt:    booking.scheduled_at,
        serviceAddress: booking.service_address ?? '',
      })
      reminderSent++
    } catch (err) {
      console.error(`[Cron] remind 발송 실패 booking=${booking.id}:`, err)
    }
  }
  console.log(`[Cron] remind 완료: ${reminderSent}건 발송`)

  return NextResponse.json({ expired, reminderSent })
}
