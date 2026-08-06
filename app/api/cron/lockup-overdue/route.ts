import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToWorker, sendPushToBusiness } from '@/lib/push/web-push'

// 문단속 미완료 감지 — Supabase pg_cron이 주기적으로(예: 20분마다) 호출.
// '문단속 필요' 정기 현장에서 도착(오픈) 사진은 올렸는데, 예상 소요 시간 + 여유가 지나도
// 마감(잠금) 사진이 없으면 직원+대표에게 알림을 보낸다. 알림은 현장당 1회만.

export const dynamic = 'force-dynamic'

const BUFFER_MINUTES = 30 // 예상 소요 시간이 지난 뒤에도 이만큼 더 기다렸다가 알림
const DEFAULT_DURATION_MINUTES = 120 // 계약에 예상 시간이 없으면 2시간으로 간주

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const headerSecret = request.headers.get('x-cron-secret')
  const querySecret = request.nextUrl.searchParams.get('secret')
  const authorized =
    authHeader === `Bearer ${secret}` || headerSecret === secret || querySecret === secret
  if (!secret || !authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient() as unknown as SupabaseClient

  // 1) 문단속 필요 계약 → 예상 소요 시간 맵
  const { data: contracts } = await db
    .from('contracts')
    .select('id, expected_duration_minutes')
    .eq('requires_lockup', true)
  const lockupContracts = (contracts ?? []) as { id: string; expected_duration_minutes: number | null }[]
  if (lockupContracts.length === 0) return NextResponse.json({ alerted: 0 })

  const durationById = new Map(lockupContracts.map((c) => [c.id, c.expected_duration_minutes ?? DEFAULT_DURATION_MINUTES]))

  // 2) 오픈은 했지만 마감 안 했고, 아직 알림 안 보낸 방문
  const { data: bookings } = await db
    .from('bookings')
    .select('id, business_id, worker_id, customer_name, service_address, checkin_at, contract_id')
    .in('contract_id', Array.from(durationById.keys()))
    .not('checkin_at', 'is', null)
    .is('checkout_at', null)
    .is('lockup_alert_sent_at', null)
    .is('deleted_at', null)
    .not('status', 'in', '("cancelled","no_show")')

  const candidates = (bookings ?? []) as {
    id: string; business_id: string; worker_id: string | null
    customer_name: string | null; service_address: string | null
    checkin_at: string; contract_id: string
  }[]

  // 3) 예상 소요 시간 + 여유가 지난 것만 추림
  const now = Date.now()
  const overdue = candidates.filter((b) => {
    const dur = durationById.get(b.contract_id) ?? DEFAULT_DURATION_MINUTES
    const deadline = new Date(b.checkin_at).getTime() + (dur + BUFFER_MINUTES) * 60 * 1000
    return now >= deadline
  })
  if (overdue.length === 0) return NextResponse.json({ alerted: 0 })

  // 4) 배정된 팀원(booking_workers) 조회 — 직원+대표 모두에게 알림
  const { data: bwRows } = await db
    .from('booking_workers')
    .select('booking_id, worker_id')
    .in('booking_id', overdue.map((b) => b.id))
  const workersByBooking = new Map<string, Set<string>>()
  for (const row of (bwRows ?? []) as { booking_id: string; worker_id: string }[]) {
    const set = workersByBooking.get(row.booking_id) ?? new Set<string>()
    set.add(row.worker_id)
    workersByBooking.set(row.booking_id, set)
  }

  let alerted = 0
  for (const b of overdue) {
    const place = b.service_address?.split(' ').slice(0, 3).join(' ') || b.customer_name || '현장'
    const workerIds = new Set(workersByBooking.get(b.id) ?? [])
    if (b.worker_id) workerIds.add(b.worker_id)

    try {
      // 직원(들)에게 — 아직 안 잠갔을 수 있다는 신호
      await Promise.all(
        Array.from(workerIds).map((wid) =>
          sendPushToWorker(wid, {
            title: '문단속 확인이 안 됐어요 🔒',
            body: `${place} — 작업 끝날 시간이 지났어요. 문 잠그고 마감 사진을 올려주세요`,
            url: `/field/${wid}/${b.id}`,
            tag: `lockup-${b.id}`,
          }),
        ),
      )
      // 대표에게 동시 에스컬레이션
      await sendPushToBusiness(b.business_id, {
        title: '현장 문단속 확인이 안 됐어요 🔒',
        body: `${place} 마감(문 잠금) 사진이 아직 없어요. 담당자에게 확인해주세요`,
        url: '/dashboard/schedule',
        tag: `lockup-${b.id}`,
      })

      await db
        .from('bookings')
        .update({ lockup_alert_sent_at: new Date().toISOString() })
        .eq('id', b.id)
      alerted++
    } catch (err) {
      console.error(`[Cron] lockup-overdue 알림 실패 booking=${b.id}:`, err)
    }
  }

  console.log(`[Cron] lockup-overdue — 알림 발송: ${alerted}건 / 후보: ${candidates.length}건`)
  return NextResponse.json({ alerted, candidates: candidates.length })
}
