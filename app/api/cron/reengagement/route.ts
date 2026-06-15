import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReengagementAlimtalk } from '@/lib/kakao/alimtalk'

// Vercel Cron: 매일 02:00 UTC (KST 오전 11시) 실행
// 마지막 방문 후 90일 경과 고객에게 재방문 유도 알림톡 발송

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // KST 기준 90일 전 UTC 범위 계산
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const d90KST = new Date(nowKST)
  d90KST.setUTCDate(nowKST.getUTCDate() - 90)
  d90KST.setUTCHours(0, 0, 0, 0)
  const d90Start = new Date(d90KST.getTime() - 9 * 60 * 60 * 1000)
  const d90End   = new Date(d90Start.getTime() + 24 * 60 * 60 * 1000)

  // 90일 전 완료된 예약 조회 (고객 정보 + 업체 정보 포함)
  const { data: bookings } = await db
    .from('bookings')
    .select('customer_phone, customer_name, business_id, businesses!business_id(name, slug)')
    .eq('status', 'completed')
    .gte('scheduled_at', d90Start.toISOString())
    .lt('scheduled_at', d90End.toISOString())
    .not('customer_phone', 'is', null)

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0 })
  }

  // 동일 고객 중복 처리 방지 (같은 크론 실행에서)
  const processed = new Set<string>()

  interface BizInfo { name: string; slug: string | null }

  interface BookingRow {
    customer_phone: string | null
    customer_name: string | null
    business_id: string
    businesses: BizInfo | BizInfo[] | null
  }

  let sent = 0, skipped = 0

  for (const booking of (bookings as BookingRow[])) {
    const { customer_phone, customer_name, business_id } = booking
    if (!customer_phone) { skipped++; continue }

    const key = `${business_id}:${customer_phone}`
    if (processed.has(key)) continue
    processed.add(key)

    try {
      // 90일 이후에 다시 방문한 예약이 있으면 스킵
      const { count: recentCount } = await db
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .eq('customer_phone', customer_phone)
        .eq('status', 'completed')
        .gte('scheduled_at', d90End.toISOString())

      if ((recentCount ?? 0) > 0) { skipped++; continue }

      // 고객 DB에서 재방문 발송 여부 확인
      const { data: customer } = await db
        .from('customers')
        .select('id, reengagement_sent_at')
        .eq('business_id', business_id)
        .eq('phone', customer_phone)
        .maybeSingle()

      if (customer?.reengagement_sent_at) { skipped++; continue }

      const biz = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
      if (!biz) { skipped++; continue }

      const quoteUrl = biz.slug ? `${appUrl}/q/${biz.slug}` : appUrl

      await sendReengagementAlimtalk({
        customerPhone: customer_phone,
        customerName:  customer_name ?? '고객',
        businessName:  biz.name,
        quoteUrl,
      })

      // 발송 시각 기록 (고객 DB에 있을 때만)
      if (customer?.id) {
        await db
          .from('customers')
          .update({ reengagement_sent_at: new Date().toISOString() })
          .eq('id', customer.id)
      }

      sent++
    } catch (err) {
      console.error(`[Cron] reengagement 발송 실패 phone=${customer_phone}:`, err)
      skipped++
    }
  }

  console.log(`[Cron] reengagement — 발송: ${sent}건 / 스킵: ${skipped}건`)

  return NextResponse.json({ sent, skipped })
}
