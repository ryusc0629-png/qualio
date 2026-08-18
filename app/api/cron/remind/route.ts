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

  // contract_id 는 database.ts 타입에 아직 없어 as never + 결과 단언으로 받는다
  type ReminderBooking = {
    id: string
    contract_id: string | null
    customer_name: string | null
    customer_phone: string | null
    scheduled_at: string | null
    service_address: string | null
    businesses: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null
    quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
  }

  const { data: bookings, error } = await db
    .from('bookings')
    .select('id, contract_id, customer_name, customer_phone, scheduled_at, service_address, businesses!business_id(name, phone), quotes!quote_id(cleaning_type)' as never)
    .eq('status', 'confirmed')
    .gte('scheduled_at', rangeStart.toISOString())
    .lt('scheduled_at', rangeEnd.toISOString())
    // 이미 보낸 예약은 제외 — 크론이 재시도돼도 고객이 같은 안내를 두 번 받지 않게
    .is('reminder_sent_at', null) as unknown as { data: ReminderBooking[] | null; error: { message: string } | null }

  if (error) {
    console.error('[Cron] remind 조회 실패:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ sent: 0, message: '내일 예약 없음' })
  }

  // 정기계약 방문은 계약에서 '전날 안내 보내기'를 켠 경우에만 보낸다.
  //
  // 왜: 주 5회 오는 거래처에 매 평일마다 "내일 방문 예정이에요"가 나가고 있었다.
  // 방문 요일이 고정된 정기 현장에는 전날 안내가 정보가 아니라 소음이다.
  // 일회성 예약(contract_id 없음)은 이 판정과 무관하게 항상 보낸다.
  const contractIds = [...new Set(bookings.map((b) => b.contract_id).filter(Boolean))] as string[]
  const reminderOnContracts = new Set<string>()

  if (contractIds.length > 0) {
    const { data: contractRows } = await db
      .from('contracts')
      .select('id, send_visit_reminder' as never)
      .in('id', contractIds) as unknown as { data: { id: string; send_visit_reminder: boolean | null }[] | null }

    for (const c of contractRows ?? []) {
      if (c.send_visit_reminder === true) reminderOnContracts.add(c.id)
    }
  }

  let sent = 0
  let failed = 0
  let skipped = 0 // 다른 실행이 이미 가져간 건(중복 발송 방지로 건너뜀)
  let recurringSkipped = 0 // 전날 안내를 끈 정기계약 방문

  for (const booking of bookings) {
    const biz = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
    const quote = Array.isArray(booking.quotes) ? booking.quotes[0] : booking.quotes

    if (!booking.customer_phone || !booking.scheduled_at || !biz) {
      failed++
      continue
    }

    if (booking.contract_id && !reminderOnContracts.has(booking.contract_id)) {
      recurringSkipped++
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

  console.log(`[Cron] remind 완료: 발송 ${sent}건, 실패 ${failed}건, 중복방지 ${skipped}건, 정기계약 제외 ${recurringSkipped}건`)
  return NextResponse.json({ sent, failed, skipped, recurringSkipped, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() })
}
