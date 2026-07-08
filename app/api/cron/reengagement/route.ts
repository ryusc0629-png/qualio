import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { generateReengagementMessage } from '@/lib/ai/reengagement-message'

// Vercel Cron(daily-maintenance에서 호출): 마지막 방문 후 90일 경과 고객에 대해
// AI 개인화 재방문 문구를 미리 만들어 '검토 대기(pending)' 대기열에 넣고, 대표에게 푸시한다.
// (기존: 제네릭 알림톡 자동발송 → 변경: 개인화 대기열. 대표가 검토 후 카톡으로 발송)
// 한 고객당 1건만(unique) — 재실행/중복 방지(멱등).

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const looseDb = db as unknown as SupabaseClient

  // KST 기준 90일 전 하루 범위(UTC)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const d90KST = new Date(nowKST)
  d90KST.setUTCDate(nowKST.getUTCDate() - 90)
  d90KST.setUTCHours(0, 0, 0, 0)
  const d90Start = new Date(d90KST.getTime() - 9 * 60 * 60 * 1000)
  const d90End = new Date(d90Start.getTime() + 24 * 60 * 60 * 1000)

  // 90일 전 완료된 예약 + 서비스명(견적)·현장 메모·업체 정보
  const { data: bookings } = (await db
    .from('bookings')
    .select('id, customer_phone, customer_name, business_id, customer_id, memo, scheduled_at, quotes!quote_id(cleaning_type), businesses!business_id(name)')
    .eq('status', 'completed')
    .gte('scheduled_at', d90Start.toISOString())
    .lt('scheduled_at', d90End.toISOString())
    .not('customer_phone', 'is', null)) as unknown as {
    data:
      | Array<{
          id: string
          customer_phone: string | null
          customer_name: string | null
          business_id: string
          customer_id: string | null
          memo: string | null
          scheduled_at: string
          quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
          businesses: { name: string } | { name: string }[] | null
        }>
      | null
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ prepared: 0, businesses: 0 })
  }

  const processed = new Set<string>()
  const newByBusiness = new Map<string, number>()
  let prepared = 0

  for (const booking of bookings) {
    const { customer_phone, customer_name, business_id, customer_id } = booking
    if (!customer_phone) continue

    const key = `${business_id}:${customer_phone}`
    if (processed.has(key)) continue
    processed.add(key)

    try {
      // 90일 이후 재방문 있으면 스킵(이미 돌아온 고객)
      const { count: recentCount } = await db
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .eq('customer_phone', customer_phone)
        .eq('status', 'completed')
        .gte('scheduled_at', d90End.toISOString())
      if ((recentCount ?? 0) > 0) continue

      // 이미 대기열에 있거나(어느 상태든) 예전 재유도 발송 이력 있으면 스킵
      const { data: existing } = (await looseDb
        .from('reengagement_dispatches')
        .select('id')
        .eq('business_id', business_id)
        .eq('customer_phone', customer_phone)
        .maybeSingle()) as unknown as { data: { id: string } | null }
      if (existing) continue

      const { data: cust } = await db
        .from('customers')
        .select('reengagement_sent_at')
        .eq('business_id', business_id)
        .eq('phone', customer_phone)
        .maybeSingle()
      if (cust?.reengagement_sent_at) continue

      const biz = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
      if (!biz) continue
      const quote = Array.isArray(booking.quotes) ? booking.quotes[0] : booking.quotes
      const lastService = quote?.cleaning_type ?? null
      const name = customer_name ?? '고객'
      const monthsSince = Math.max(1, Math.round((Date.now() - new Date(booking.scheduled_at).getTime()) / (30 * 24 * 60 * 60 * 1000)))

      // AI 개인화 문구 생성(실패해도 폴백 문구 반환)
      const message = await generateReengagementMessage({
        businessName: biz.name,
        customerName: name,
        lastService,
        monthsSince,
        memo: booking.memo,
      })

      const { error: insErr } = await looseDb.from('reengagement_dispatches').insert({
        business_id,
        customer_id: customer_id ?? null,
        customer_phone,
        customer_name: name,
        last_booking_id: booking.id,
        last_service: lastService,
        last_serviced_at: booking.scheduled_at,
        months_since: monthsSince,
        message,
        status: 'pending',
        channel: 'manual',
      })
      if (insErr) {
        if (!String(insErr.message || '').includes('duplicate')) {
          console.error('[Cron] reengagement 대기열 삽입 실패:', insErr)
        }
        continue
      }

      prepared++
      newByBusiness.set(business_id, (newByBusiness.get(business_id) ?? 0) + 1)
    } catch (err) {
      console.error(`[Cron] reengagement 준비 실패 phone=${customer_phone}:`, err)
    }
  }

  // 새 대기 건 있는 업체 대표에게 푸시
  let pushed = 0
  for (const [businessId, cnt] of newByBusiness) {
    try {
      await sendPushToBusiness(businessId, {
        title: '재방문 유도할 고객이 있어요 🤝',
        body: `한동안 안 오신 단골 ${cnt}분께 보낼 개인화 메시지가 준비됐어요. 검토하고 보내주세요`,
        url: '/dashboard/reengagement',
        tag: 'reengagement-prepare',
      })
      pushed++
    } catch (err) {
      console.error(`[Cron] reengagement 푸시 실패 business=${businessId}:`, err)
    }
  }

  console.log(`[Cron] reengagement — 준비 ${prepared}건 / 푸시 ${pushed}업체`)
  return NextResponse.json({ prepared, businesses: pushed })
}
