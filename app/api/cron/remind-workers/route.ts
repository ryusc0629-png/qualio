import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToWorker } from '@/lib/push/web-push'

// Vercel Cron(daily-maintenance에서 호출): 매일 01:00 UTC (KST 오전 10시) 실행.
// 내일 방문 예정인 현장에 배정된 직원·도급사의 폰(현장 앱)에 "내일 어디 몇 시" 푸시로 미리 알린다.
// 지금은 현장 앱을 직접 열어야만 오늘 일정만 보여, 도급사·직원이 내일 배정을 놓치기 쉬움.
// 취소·불참 등은 제외하고 확정(confirmed) 예약만 대상으로 한다.

export const dynamic = 'force-dynamic'

interface BookingRow {
  id: string
  customer_name: string | null
  service_address: string | null
  scheduled_at: string
  worker_id: string | null
}

// KST 기준 "오후 2시", "오전 9시 30분" 형태로 짧게 표시
function formatKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

// 주간 알림에서 날짜를 부르는 말. 내일이면 그냥 "내일", 그 뒤면 "8월 26일(수)".
function formatKstDayLabel(iso: string, tomorrowStartMs: number): string {
  const ms = new Date(iso).getTime()
  if (ms < tomorrowStartMs + 24 * 60 * 60 * 1000) return '내일'
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  })
}

export async function GET(request: NextRequest) {
  // daily-maintenance self-fetch는 authorization·x-cron-secret·?secret 모두 전달한다.
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const headerSecret = request.headers.get('x-cron-secret')
  const querySecret = request.nextUrl.searchParams.get('secret')
  const authorized =
    authHeader === `Bearer ${secret}` || headerSecret === secret || querySecret === secret
  if (!secret || !authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // booking_workers·bookings.worker_id는 아직 database.ts 타입에 없어 느슨한 클라이언트로 접근
  const looseDb = createServiceClient() as unknown as SupabaseClient

  // 내일(KST 00:00 ~ 23:59) 범위를 UTC로 계산 — expire-quotes의 고객 리마인더와 동일 방식
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const tomorrowKST = new Date(nowKST)
  tomorrowKST.setUTCDate(nowKST.getUTCDate() + 1)
  tomorrowKST.setUTCHours(0, 0, 0, 0)
  const rangeStart = new Date(tomorrowKST.getTime() - 9 * 60 * 60 * 1000)

  // 일요일(KST)에는 내일 하루가 아니라 한 주치(월~일)를 한 번에 알린다.
  // 주 중반에만 일정이 있는 직원·도급사도 미리 인력을 잡을 수 있어야 하기 때문.
  // 알림은 어차피 하루 한 번이므로 일요일엔 '이번 주' 알림 하나로 대체된다 — 두 번 오지 않는다.
  // nowKST는 이미 +9시간 보정된 값이라 요일은 getUTCDay()로 읽어야 KST 요일이 된다.
  const isWeeklyDay = nowKST.getUTCDay() === 0
  const spanDays = isWeeklyDay ? 7 : 1
  const rangeEnd = new Date(rangeStart.getTime() + spanDays * 24 * 60 * 60 * 1000)

  const { data: bookings, error } = (await looseDb
    .from('bookings')
    .select('id, customer_name, service_address, scheduled_at, worker_id')
    .eq('status', 'confirmed')
    .gte('scheduled_at', rangeStart.toISOString())
    .lt('scheduled_at', rangeEnd.toISOString())) as unknown as {
    data: BookingRow[] | null
    error: { message: string } | null
  }

  if (error) {
    console.error('[Cron] remind-workers 예약 조회 실패:', error)
    return NextResponse.json({ error: '예약 조회 실패' }, { status: 500 })
  }

  const tomorrowBookings = bookings ?? []
  if (tomorrowBookings.length === 0) {
    return NextResponse.json({ workers: 0, bookings: 0 })
  }

  // 예약 → 배정된 worker 목록. bookings.worker_id(주담당) + booking_workers(팀원) 모두 포함.
  const workerJobs = new Map<string, BookingRow[]>()
  const addJob = (workerId: string, booking: BookingRow) => {
    const list = workerJobs.get(workerId) ?? []
    if (!list.some((b) => b.id === booking.id)) list.push(booking)
    workerJobs.set(workerId, list)
  }

  const bookingById = new Map(tomorrowBookings.map((b) => [b.id, b]))
  for (const b of tomorrowBookings) {
    if (b.worker_id) addJob(b.worker_id, b)
  }

  const { data: bwRows } = await looseDb
    .from('booking_workers')
    .select('booking_id, worker_id')
    .in('booking_id', Array.from(bookingById.keys()))

  for (const row of (bwRows ?? []) as { booking_id: string; worker_id: string }[]) {
    const booking = bookingById.get(row.booking_id)
    if (booking) addJob(row.worker_id, booking)
  }

  if (workerJobs.size === 0) {
    return NextResponse.json({ workers: 0, bookings: tomorrowBookings.length })
  }

  let pushed = 0
  for (const [workerId, jobs] of workerJobs) {
    jobs.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const first = jobs[0]
    const time = formatKstTime(first.scheduled_at)
    // 주소는 앞부분만 짧게 (푸시 본문이 너무 길지 않게)
    const place = first.service_address?.split(' ').slice(0, 3).join(' ') ?? '현장'

    const dayLabel = formatKstDayLabel(first.scheduled_at, rangeStart.getTime())

    const body = isWeeklyDay
      ? jobs.length === 1
        ? `이번 주는 ${dayLabel} ${time} ${place} 한 곳이에요`
        : `이번 주 ${jobs.length}곳 예정이에요. 첫 일정은 ${dayLabel} ${time} ${place}`
      : jobs.length === 1
        ? `내일 ${time} ${place} — ${first.customer_name ?? '고객'}님 현장이에요`
        : `내일 ${jobs.length}곳 예정이에요. 첫 일정은 ${time} ${place}`

    try {
      await sendPushToWorker(workerId, {
        title: isWeeklyDay ? '이번 주 일정 미리 알림 🧹' : '내일 일정 미리 알림 🧹',
        body,
        url: `/field/${workerId}`,
        // 같은 tag → 매일 새 알림이 쌓이지 않고 최신 것으로 갱신
        tag: 'remind-workers',
      })
      pushed++
    } catch (err) {
      console.error(`[Cron] remind-workers 푸시 실패 worker=${workerId}:`, err)
    }
  }

  const scope = isWeeklyDay ? '이번 주' : '내일'
  console.log(`[Cron] remind-workers — 푸시: ${pushed}명 / ${scope} 예약: ${tomorrowBookings.length}건`)

  return NextResponse.json({ scope, workers: pushed, bookings: tomorrowBookings.length })
}
