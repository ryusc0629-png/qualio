import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReviewRequestAlimtalk } from '@/lib/kakao/alimtalk'
import { randomBytes } from 'crypto'

// Vercel Cron: 매일 01:00 UTC (KST 오전 10시) 실행
// D+1: 작업 완료 후 다음날 후기 요청 알림톡 발송 (인증 페이지 링크 포함)
// D+3: 미응답 고객에게 팔로업 1회 재발송

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

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

// 저장된 값은 숫자뿐이라(예: '10') 알림톡에 그대로 넣으면 "혜택: 10"이 된다.
// 고객 화면(app/review/[token])과 같은 문장으로 맞춘다.
function rewardSentence(biz: BizInfo): string | null {
  const v = biz.review_reward_description
  if (!v) return null
  if (biz.review_reward_type === 'discount_rate')   return `후기 남겨주시면 다음 이용 시 ${v}% 할인해 드려요`
  if (biz.review_reward_type === 'discount_amount') return `후기 남겨주시면 다음 이용 시 ${Number(v).toLocaleString()}원 할인해 드려요`
  return null
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
      .select('id, business_id, worker_id, customer_name, customer_phone, scheduled_at, quotes!quote_id(cleaning_type), workers!worker_id(name), businesses!business_id(name, phone, google_place_url, naver_place_url, danggeun_review_url, kakao_place_url, active_review_platform, review_reward_type, review_reward_description)')
      .eq('status', 'completed')
      .gte('scheduled_at', d1Start.toISOString())
      .lt('scheduled_at', d1End.toISOString())
      .is('auto_review_sent_at', null),

    db
      .from('bookings')
      .select('id, business_id, worker_id, customer_name, customer_phone, scheduled_at, quotes!quote_id(cleaning_type), workers!worker_id(name), businesses!business_id(name, phone, google_place_url, naver_place_url, danggeun_review_url, kakao_place_url, active_review_platform, review_reward_type, review_reward_description)')
      .eq('status', 'completed')
      .gte('scheduled_at', d3Start.toISOString())
      .lt('scheduled_at', d3End.toISOString())
      .not('auto_review_sent_at', 'is', null)
      .is('auto_review_followup_sent_at', null),
  ])

  interface BookingRow {
    id: string
    business_id: string
    worker_id: string | null
    customer_name: string | null
    customer_phone: string | null
    scheduled_at: string
    quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
    workers: { name: string | null } | { name: string | null }[] | null
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
        worker_id:     booking.worker_id,   // 성과 집계용 — 그 현장의 담당 기사
      } as never)

      // 인증 페이지 URL (토큰 포함) — 클릭 시 인증 후 후기 사이트로 이동
      const claimUrl = `${appUrl}/review/${token}`

      const workerRow = Array.isArray(booking.workers) ? booking.workers[0] : booking.workers
      await sendReviewRequestAlimtalk({
        customerPhone: booking.customer_phone,
        customerName:  booking.customer_name ?? '고객',
        businessName:  biz.name,
        cleaningType:  quote?.cleaning_type ?? '청소 서비스',
        reviewUrl:     claimUrl,
        workerName:    workerRow?.name ?? null,
        rewardText:    rewardSentence(biz),
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
    const ok = await sendReview(booking as unknown as BookingRow, false)
    ok ? d1Sent++ : d1Skipped++
  }

  // 이미 후기를 남긴 고객에게 "후기 남겨주세요"를 또 보내지 않는다.
  // 발송 기록(auto_review_followup_sent_at)만 보고 재발송하면, 정성껏 써준 고객이
  // 3일 뒤에 같은 부탁을 또 받는다 — 가장 아껴야 할 고객을 귀찮게 하는 셈.
  const d3Candidates = (d3Result.data ?? []) as unknown as BookingRow[]
  const claimedBookingIds = new Set<string>()
  if (d3Candidates.length > 0) {
    const { data: claimed } = await db
      .from('review_claims')
      .select('booking_id')
      .in('booking_id', d3Candidates.map((b) => b.id))
      .not('claimed_at', 'is', null)
    for (const row of (claimed ?? []) as { booking_id: string }[]) {
      claimedBookingIds.add(row.booking_id)
    }
  }

  let d3Sent = 0, d3Skipped = 0, d3AlreadyReviewed = 0
  for (const booking of d3Candidates) {
    if (claimedBookingIds.has(booking.id)) {
      // 후기를 남긴 고객 — 재발송하지 않되, 다시 후보로 잡히지 않게 발송 기록만 남긴다
      await db
        .from('bookings')
        .update({ auto_review_followup_sent_at: new Date().toISOString() } as never)
        .eq('id', booking.id)
      d3AlreadyReviewed++
      continue
    }
    const ok = await sendReview(booking, true)
    ok ? d3Sent++ : d3Skipped++
  }

  console.log(
    `[Cron] review-request — D+1: ${d1Sent}건 / D+3: ${d3Sent}건 (이미 후기 남김 ${d3AlreadyReviewed}건 제외)`
  )

  return NextResponse.json({
    d1: { sent: d1Sent, skipped: d1Skipped },
    d3: { sent: d3Sent, skipped: d3Skipped, alreadyReviewed: d3AlreadyReviewed },
  })
}
