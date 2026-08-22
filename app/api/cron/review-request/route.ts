import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReviewRequestAlimtalk } from '@/lib/kakao/alimtalk'
import { randomBytes } from 'crypto'

// Vercel Cron: 매일 01:00 UTC (KST 오전 10시) 실행
// D+1: 작업 완료 후 다음날 후기 요청 알림톡 발송 (인증 페이지 링크 포함)
//
// ⛔D+3 재발송을 되살리지 말 것 (2026-08-22 결정).
//   같은 템플릿을 문구도 그대로 이틀 뒤에 한 번 더 보내는 완전 중복이었다.
//   일회성 고객은 청소 한 번에 카톡을 이미 여러 통 받고, 그중 후기 요청은
//   고객이 원해서 받는 메시지가 아니다. 조르는 횟수를 늘리는 대신 한 번만 보낸다.
//   (auto_review_followup_sent_at 컬럼과 review_claims.is_followup은 지난 발송
//    기록이라 그대로 둔다 — 읽기만 하고 새로 쓰지 않는다)

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

  const d1Result = await db
    .from('bookings')
    .select('id, business_id, contract_id, worker_id, customer_name, customer_phone, scheduled_at, quotes!quote_id(cleaning_type), workers!worker_id(name, type), businesses!business_id(name, phone, google_place_url, naver_place_url, danggeun_review_url, kakao_place_url, active_review_platform, review_reward_type, review_reward_description)')
    .eq('status', 'completed')
    // 정기계약 방문은 제외 — 매 방문마다 후기를 조르면 거래처가 피로해진다.
    // (주 5회 현장이면 후기 요청이 매 평일 나간다) 후기는 일회성 작업에만 요청한다.
    .is('contract_id', null)
    .gte('scheduled_at', d1Start.toISOString())
    .lt('scheduled_at', d1End.toISOString())
    .is('auto_review_sent_at', null)

  interface BookingRow {
    id: string
    business_id: string
    contract_id: string | null
    worker_id: string | null
    customer_name: string | null
    customer_phone: string | null
    scheduled_at: string
    quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
    workers: { name: string | null; type: string | null } | { name: string | null; type: string | null }[] | null
    businesses: BizInfo | BizInfo[] | null
  }

  async function sendReview(booking: BookingRow): Promise<boolean> {
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
        is_followup:   false,   // 재발송을 없앴으므로 항상 1차다. 컬럼은 지난 기록 때문에 남겨둔다

        worker_id:     booking.worker_id,   // 성과 집계용 — 그 현장의 담당 기사
      } as never)

      const workerRow = Array.isArray(booking.workers) ? booking.workers[0] : booking.workers
      await sendReviewRequestAlimtalk({
        customerPhone: booking.customer_phone,
        customerName:  booking.customer_name ?? '고객',
        businessName:  biz.name,
        cleaningType:  quote?.cleaning_type ?? '청소 서비스',
        reviewToken:   token,
        workerName:    workerRow?.name ?? null,
        workerType:    workerRow?.type ?? null,
        rewardText:    rewardSentence(biz),
      })

      await db
        .from('bookings')
        .update({ auto_review_sent_at: new Date().toISOString() })
        .eq('id', booking.id)
      return true
    } catch (err) {
      console.error(`[Cron] review-request 발송 실패 booking=${booking.id}:`, err)
      return false
    }
  }

  let d1Sent = 0, d1Skipped = 0
  for (const booking of (d1Result.data ?? [])) {
    const ok = await sendReview(booking as unknown as BookingRow)
    ok ? d1Sent++ : d1Skipped++
  }

  console.log(`[Cron] review-request — D+1: ${d1Sent}건 발송 / ${d1Skipped}건 건너뜀`)

  return NextResponse.json({
    d1: { sent: d1Sent, skipped: d1Skipped },
  })
}
