import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendQuoteFollowupAlimtalk } from '@/lib/kakao/alimtalk'

// Vercel Cron: 매일 01:00 UTC (KST 오전 10시) 실행
// D+1: 견적 신청 후 예약 안 한 고객에게 팔로업 알림톡
// D+3: D+1 발송 후에도 예약 안 한 고객에게 2차 팔로업

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // KST 기준 날짜 범위 계산
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)

  // D+1: 어제 신청된 견적 (KST → UTC 변환)
  const d1KST = new Date(nowKST)
  d1KST.setUTCDate(nowKST.getUTCDate() - 1)
  d1KST.setUTCHours(0, 0, 0, 0)
  const d1Start = new Date(d1KST.getTime() - 9 * 60 * 60 * 1000)
  const d1End   = new Date(d1Start.getTime() + 24 * 60 * 60 * 1000)

  // D+3: 3일 전 신청된 견적
  const d3Start = new Date(d1Start.getTime() - 2 * 24 * 60 * 60 * 1000)
  const d3End   = new Date(d3Start.getTime() + 24 * 60 * 60 * 1000)

  const [d1Result, d3Result] = await Promise.all([
    // D+1: 어제 견적 신청 + 예약 미전환 + 팔로업 미발송
    db
      .from('quotes')
      .select('id, business_id, customer_name, customer_phone, cleaning_type, businesses!business_id(name, slug)')
      .eq('status', 'pending')
      .gte('created_at', d1Start.toISOString())
      .lt('created_at', d1End.toISOString())
      .is('followup_sent_at', null)
      .not('customer_phone', 'is', null),

    // D+3: 3일 전 견적 신청 + 예약 미전환 + D+1 발송 완료 + D+3 미발송
    db
      .from('quotes')
      .select('id, business_id, customer_name, customer_phone, cleaning_type, businesses!business_id(name, slug)')
      .eq('status', 'pending')
      .gte('created_at', d3Start.toISOString())
      .lt('created_at', d3End.toISOString())
      .not('followup_sent_at', 'is', null)
      .is('followup2_sent_at', null)
      .not('customer_phone', 'is', null),
  ])

  interface BizInfo {
    name: string
    slug: string | null
  }

  interface QuoteRow {
    id: string
    business_id: string
    customer_name: string | null
    customer_phone: string | null
    cleaning_type: string | null
    businesses: BizInfo | BizInfo[] | null
  }

  async function sendFollowup(quote: QuoteRow, isSecond: boolean): Promise<boolean> {
    const biz = Array.isArray(quote.businesses) ? quote.businesses[0] : quote.businesses

    if (!quote.customer_phone || !biz) return false

    // 견적 페이지 URL (slug 기반)
    const quoteUrl = biz.slug
      ? `${appUrl}/q/${biz.slug}`
      : appUrl

    try {
      await sendQuoteFollowupAlimtalk({
        customerPhone: quote.customer_phone,
        customerName:  quote.customer_name ?? '고객',
        businessName:  biz.name,
        cleaningType:  quote.cleaning_type ?? '청소 서비스',
        quoteUrl,
        isSecond,
      })

      const updateField = isSecond
        ? { followup2_sent_at: new Date().toISOString() }
        : { followup_sent_at: new Date().toISOString() }

      await db.from('quotes').update(updateField).eq('id', quote.id)
      return true
    } catch (err) {
      console.error(`[Cron] quote-followup 발송 실패 quote=${quote.id}:`, err)
      return false
    }
  }

  let d1Sent = 0, d1Skipped = 0
  for (const quote of (d1Result.data ?? [])) {
    const ok = await sendFollowup(quote as QuoteRow, false)
    ok ? d1Sent++ : d1Skipped++
  }

  let d3Sent = 0, d3Skipped = 0
  for (const quote of (d3Result.data ?? [])) {
    const ok = await sendFollowup(quote as QuoteRow, true)
    ok ? d3Sent++ : d3Skipped++
  }

  console.log(`[Cron] quote-followup — D+1: ${d1Sent}건 / D+3: ${d3Sent}건`)

  return NextResponse.json({
    d1: { sent: d1Sent, skipped: d1Skipped },
    d3: { sent: d3Sent, skipped: d3Skipped },
  })
}
