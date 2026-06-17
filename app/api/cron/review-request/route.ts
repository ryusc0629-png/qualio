import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReviewRequestAlimtalk } from '@/lib/kakao/alimtalk'
import { randomBytes } from 'crypto'

// Vercel Cron: 매일 01:00 UTC (KST 오전 10시) 실행
// D+1: 작업 완료 후 다음날 후기 요청 알림톡 발송 (인증 페이지 링크 포함)
// D+3: 미응답 고객에게 팔로업 1회 재발송

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

function resolveReviewUrl(biz: BizInfo): string | null {
  const urlMap: Record<string, string | null> = {
    naver: biz.naver_place_url,
    google: biz.google_place_url,
    danggeun: biz.danggeun_review_url,
    kakao: biz.kakao_place_url,
  }
  // 활성 채널 URL 우선, 없으면 아무 URL이라도 사용
  return urlMap[biz.active_review_platform] ?? biz.google_place_url ?? biz.naver_place_url ?? null
}

function generateToken(): string {
  return randomBytes(20).toString('hex')
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // KST 기준 어제 UTC 범위 계산
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const yesterdayKST = new Date(nowKST)
  yesterdayKST.setUTCDate(nowKST.getUTCDate() - 1)
  yesterdayKST.setUTCHours(0, 0, 0, 0)
  const d1Start = new Date(yesterdayKST.getTime() - 9 * 60 * 60 * 1000)
  const d1End   = new Date(d1Start.getTime() + 24 * 60 * 60 * 1000)

  const d3Start = new Date(d1Start.getTime() - 2 * 24 * 60 * 60 * 1000)
  const d3End   = new Date(d3Start.getTime() + 24 * 60 * 60 * 1000)

  const [d1Result, d3Result] = await Promise.all([
    db
      .from('bookings')
      .select('id, business_id, customer_name, customer_phone, scheduled_at, quotes!quote_id(cleaning_type), businesses!business_id(name, phone, google_place_url, naver_place_url, danggeun_review_url, kakao_place_url, active_review_platform, review_reward_type, review_reward_description)')
      .eq('status', 'completed')
      .gte('scheduled_at', d1Start.toISOString())
      .lt('scheduled_at', d1End.toISOString())
      .is('auto_review_sent_at', null),

    db
      .from('bookings')
      .select('id, business_id, customer_name, customer_phone, scheduled_at, quotes!quote_id(cleaning_type), businesses!business_id(name, phone, google_place_url, naver_place_url, danggeun_review_url, kakao_place_url, active_review_platform, review_reward_type, review_reward_description)')
      .eq('status', 'completed')
      .gte('scheduled_at', d3Start.toISOString())
      .lt('scheduled_at', d3End.toISOString())
      .not('auto_review_sent_at', 'is', null)
      .is('auto_review_followup_sent_at', null),
  ])

  interface BizInfo {
    name: string
    phone: string | null
    google_place_url: string | null
    naver_place_url: string | null
    danggeun_review_url: string | null
    kakao_place_url: string | null
    active_review_platform: string
    review_reward_type: string
    review_reward_description: string | null
  }

  interface BookingRow {
    id: string
    business_id: string
    customer_name: string | null
    customer_phone: string | null
    scheduled_at: string
    quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
    businesses: BizInfo | BizInfo[] | null
  }

  async function sendReview(booking: BookingRow, isFollowup: boolean): Promise<boolean> {
    const biz   = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
    const quote = Array.isArray(booking.quotes) ? booking.quotes[0] : booking.quotes

    if (!booking.customer_phone || !biz) return false

    const directReviewUrl = resolveReviewUrl(biz)
    if (!directReviewUrl) return false  // 후기 링크 미설정 스킵

    try {
      // 인증 토큰 생성 + review_claims 저장
      const token = generateToken()
      await db.from('review_claims').insert({
        booking_id:    booking.id,
        business_id:   booking.business_id,
        customer_phone: booking.customer_phone,
        token,
        is_followup:   isFollowup,
      })

      // 인증 페이지 URL (토큰 포함) — 클릭 시 인증 후 후기 사이트로 이동
      const claimUrl = `${appUrl}/review/${token}`

      await sendReviewRequestAlimtalk({
        customerPhone: booking.customer_phone,
        customerName:  booking.customer_name ?? '고객',
        businessName:  biz.name,
        cleaningType:  quote?.cleaning_type ?? '청소 서비스',
        reviewUrl:     claimUrl,
      })

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
  for (const booking of (d1Result.data ?? [])) {
    const ok = await sendReview(booking as BookingRow, false)
    ok ? d1Sent++ : d1Skipped++
  }

  let d3Sent = 0, d3Skipped = 0
  for (const booking of (d3Result.data ?? [])) {
    const ok = await sendReview(booking as BookingRow, true)
    ok ? d3Sent++ : d3Skipped++
  }

  console.log(`[Cron] review-request — D+1: ${d1Sent}건 / D+3: ${d3Sent}건`)

  return NextResponse.json({
    d1: { sent: d1Sent, skipped: d1Skipped },
    d3: { sent: d3Sent, skipped: d3Skipped },
  })
}
