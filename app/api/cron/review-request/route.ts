import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReviewRequestAlimtalk } from '@/lib/kakao/alimtalk'

// Vercel Cron: 매일 01:00 UTC (KST 오전 10시) 실행
// D+1: 작업 완료 후 다음날 후기 요청 알림톡 발송
// D+3: 미응답 고객에게 팔로업 1회 재발송

// 리뷰 URL 결정 — 구글 플레이스 우선, 없으면 네이버 플레이스
function resolveReviewUrl(googleUrl: string | null, naverUrl: string | null): string | null {
  return googleUrl || naverUrl || null
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // KST 기준 어제 00:00 ~ 23:59 UTC 범위 계산
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const yesterdayKST = new Date(nowKST)
  yesterdayKST.setUTCDate(nowKST.getUTCDate() - 1)
  yesterdayKST.setUTCHours(0, 0, 0, 0)
  const d1Start = new Date(yesterdayKST.getTime() - 9 * 60 * 60 * 1000)  // UTC
  const d1End   = new Date(d1Start.getTime() + 24 * 60 * 60 * 1000)

  // D+3 기준: 3일 전 완료된 건
  const d3Start = new Date(d1Start.getTime() - 2 * 24 * 60 * 60 * 1000)
  const d3End   = new Date(d3Start.getTime() + 24 * 60 * 60 * 1000)

  // D+1 대상: 어제 완료 + 아직 후기 요청 안 보낸 건
  const { data: d1Bookings } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, scheduled_at, quotes!quote_id(cleaning_type), businesses!business_id(name, google_place_url, naver_place_url)')
    .eq('status', 'completed')
    .gte('scheduled_at', d1Start.toISOString())
    .lt('scheduled_at', d1End.toISOString())
    .is('auto_review_sent_at', null)

  // D+3 대상: 3일 전 완료 + D+1 발송 완료 + 팔로업 안 보낸 건
  const { data: d3Bookings } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, scheduled_at, quotes!quote_id(cleaning_type), businesses!business_id(name, google_place_url, naver_place_url)')
    .eq('status', 'completed')
    .gte('scheduled_at', d3Start.toISOString())
    .lt('scheduled_at', d3End.toISOString())
    .not('auto_review_sent_at', 'is', null)
    .is('auto_review_followup_sent_at', null)

  interface BookingRow {
    id: string
    customer_name: string | null
    customer_phone: string | null
    scheduled_at: string
    quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
    businesses: { name: string; google_place_url: string | null; naver_place_url: string | null } | { name: string; google_place_url: string | null; naver_place_url: string | null }[] | null
  }

  async function sendReview(booking: BookingRow, isFollowup: boolean): Promise<boolean> {
    const biz   = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
    const quote = Array.isArray(booking.quotes) ? booking.quotes[0] : booking.quotes

    if (!booking.customer_phone || !biz) return false

    const reviewUrl = resolveReviewUrl(biz.google_place_url, biz.naver_place_url)
    if (!reviewUrl) {
      // 후기 링크 미설정 업체는 스킵
      return false
    }

    try {
      await sendReviewRequestAlimtalk({
        customerPhone: booking.customer_phone,
        customerName:  booking.customer_name ?? '고객',
        businessName:  biz.name,
        cleaningType:  quote?.cleaning_type ?? '청소 서비스',
        reviewUrl,
      })

      // 발송 기록
      const updateField = isFollowup
        ? { auto_review_followup_sent_at: new Date().toISOString() }
        : { auto_review_sent_at: new Date().toISOString() }

      await db.from('bookings').update(updateField).eq('id', booking.id)
      return true
    } catch (err) {
      console.error(`[Cron] review-request 발송 실패 booking=${booking.id}:`, err)
      return false
    }
  }

  let d1Sent = 0, d1Skipped = 0
  for (const booking of (d1Bookings ?? [])) {
    const ok = await sendReview(booking as BookingRow, false)
    ok ? d1Sent++ : d1Skipped++
  }

  let d3Sent = 0, d3Skipped = 0
  for (const booking of (d3Bookings ?? [])) {
    const ok = await sendReview(booking as BookingRow, true)
    ok ? d3Sent++ : d3Skipped++
  }

  console.log(`[Cron] review-request 완료 — D+1: ${d1Sent}건 발송 / ${d1Skipped}건 스킵, D+3: ${d3Sent}건 발송 / ${d3Skipped}건 스킵`)

  return NextResponse.json({
    d1: { sent: d1Sent, skipped: d1Skipped },
    d3: { sent: d3Sent, skipped: d3Skipped },
  })
}
