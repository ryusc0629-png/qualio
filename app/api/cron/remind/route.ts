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
    // 이미 보낸 예약은 제외 — 크론이 재시도돼도 고객이 같은 안내를 두 번 받지 않게
    .is('reminder_sent_at', null)

  if (error) {
    console.error('[Cron] remind 조회 실패:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ sent: 0, message: '내일 예약 없음' })
  }

  let sent = 0
  let failed = 0
  let skipped = 0 // 다른 실행이 이미 가져간 건(중복 발송 방지로 건너뜀)

  for (const booking of bookings) {
    const biz = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
    const quote = Array.isArray(booking.quotes) ? booking.quotes[0] : booking.quotes

    if (!booking.customer_phone || !booking.scheduled_at || !biz) {
      failed++
      continue
    }

    // 보내기 '전에' 먼저 발송 기록을 선점한다(reminder_sent_at 이 비어 있을 때만 갱신).
    // 발송 후에 기록하면, 이 크론이 동시에 두 번 호출될 때 둘 다 "아직 안 보냄"으로 읽어
    // 고객이 같은 안내를 2통 받는다. 선점에 실패한 쪽(=이미 다른 실행이 가져감)은 건너뛴다.
    const { data: claimed } = await db
      .from('bookings')
      .update({ reminder_sent_at: new Date().toISOString() } as never)
      .eq('id', booking.id)
      .is('reminder_sent_at', null)
      .select('id')

    if (!claimed || claimed.length === 0) {
      skipped++
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
      // 실제로 못 보냈으니 선점을 풀어 다음 실행에서 다시 시도하게 한다
      await db
        .from('bookings')
        .update({ reminder_sent_at: null } as never)
        .eq('id', booking.id)
      failed++
    }
  }

  console.log(`[Cron] remind 완료: 발송 ${sent}건, 실패 ${failed}건, 건너뜀 ${skipped}건`)
  return NextResponse.json({ sent, failed, skipped, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() })
}
