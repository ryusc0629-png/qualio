import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReminderAlimtalk } from '@/lib/kakao/alimtalk'

// Vercel Cron: 매일 09:00 UTC (한국 오후 6시) 실행
// 내일 방문 예정인 confirmed 예약에 리마인더 알림톡 발송

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // "내일 KST 00:00 ~ 23:59"를 UTC 범위로 계산
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const tomorrowKST = new Date(nowKST)
  tomorrowKST.setUTCDate(nowKST.getUTCDate() + 1)
  tomorrowKST.setUTCHours(0, 0, 0, 0)
  const rangeStart = new Date(tomorrowKST.getTime() - 9 * 60 * 60 * 1000)
  const rangeEnd   = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000)

  const db = createServiceClient()

  const { data: bookings, error } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, scheduled_at, service_address, businesses!business_id(name, phone), quotes!quote_id(cleaning_type)')
    .eq('status', 'confirmed')
    .gte('scheduled_at', rangeStart.toISOString())
    .lt('scheduled_at', rangeEnd.toISOString())

  if (error) {
    console.error('[Cron] remind 조회 실패:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ sent: 0, message: '내일 예약 없음' })
  }

  let sent = 0
  let failed = 0

  for (const booking of bookings) {
    const biz = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
    const quote = Array.isArray(booking.quotes) ? booking.quotes[0] : booking.quotes

    if (!booking.customer_phone || !booking.scheduled_at || !biz) {
      failed++
      continue
    }

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
      sent++
    } catch (err) {
      console.error(`[Cron] remind 발송 실패 booking=${booking.id}:`, err)
      failed++
    }
  }

  console.log(`[Cron] remind 완료: 발송 ${sent}건, 실패 ${failed}건`)
  return NextResponse.json({ sent, failed, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() })
}
