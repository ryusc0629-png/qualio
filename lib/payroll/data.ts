import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type PayType,
  type PayrollVisit,
  type WorkerPayroll,
  isPayType,
  summarizeVisits,
  computeAmount,
} from './compute'

// 'YYYY-MM' → 그 달(KST)의 UTC 범위 + 표시 라벨 + 월말일(entry_date용)
export function monthRangeUtc(month: string): { start: string; end: string; label: string; lastDay: string } {
  const [y, m] = month.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const start = new Date(`${month}-01T00:00:00+09:00`).toISOString()
  const end = new Date(`${ny}-${String(nm).padStart(2, '0')}-01T00:00:00+09:00`).toISOString()
  // 월말일 (finance_entries.entry_date를 그 달 안에 두기 위해)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start, end, label: `${y}년 ${m}월`, lastDay: `${month}-${String(last).padStart(2, '0')}` }
}

// 이번 달(KST) 'YYYY-MM'
export function currentMonthKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

type WorkerRow = { id: string; name: string; type: string; pay_type: string | null; pay_rate: number | null }

// 한 업체의 특정 월 급여 계산 결과(직원별)
export async function getMonthlyPayroll(
  db: SupabaseClient,
  businessId: string,
  month: string,
): Promise<WorkerPayroll[]> {
  const { start, end } = monthRangeUtc(month)

  // 1) 활성 직원/도급사
  const { data: workersRaw } = (await db
    .from('workers')
    .select('id, name, type, pay_type, pay_rate')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })) as unknown as { data: WorkerRow[] | null }
  const workers = workersRaw ?? []
  if (workers.length === 0) return []

  // 2) 이 달 완료된 방문
  const { data: bookingsRaw } = (await db
    .from('bookings')
    .select('id, scheduled_at, customer_name, service_address, worker_id, checkin_at, checkout_at')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .order('scheduled_at', { ascending: true })) as unknown as {
    data: (PayrollVisit & { worker_id: string | null })[] | null
  }
  const bookings = bookingsRaw ?? []
  const bookingById = new Map(bookings.map((b) => [b.id, b]))

  // 3) 팀 배정(다대다) — 이 달 방문에 배정된 팀원
  const bookingIds = bookings.map((b) => b.id)
  const assignmentByWorker = new Map<string, Set<string>>()
  if (bookingIds.length > 0) {
    const { data: bwRaw } = (await db
      .from('booking_workers')
      .select('booking_id, worker_id')
      .in('booking_id', bookingIds)) as unknown as { data: { booking_id: string; worker_id: string }[] | null }
    for (const bw of bwRaw ?? []) {
      if (!assignmentByWorker.has(bw.worker_id)) assignmentByWorker.set(bw.worker_id, new Set())
      assignmentByWorker.get(bw.worker_id)!.add(bw.booking_id)
    }
  }

  // 4) 직원별 방문 묶기(직접 배정 worker_id + 팀 배정 booking_workers, 중복 제거) → 계산
  return workers.map((w) => {
    const ids = new Set<string>()
    for (const b of bookings) if (b.worker_id === w.id) ids.add(b.id)
    for (const id of assignmentByWorker.get(w.id) ?? []) ids.add(id)

    const visits: PayrollVisit[] = Array.from(ids)
      .map((id) => bookingById.get(id))
      .filter((b): b is PayrollVisit & { worker_id: string | null } => !!b)
      .map((b) => ({
        id: b.id,
        scheduled_at: b.scheduled_at,
        customer_name: b.customer_name,
        service_address: b.service_address,
        checkin_at: b.checkin_at,
        checkout_at: b.checkout_at,
      }))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

    const payType: PayType | null = isPayType(w.pay_type) ? w.pay_type : null
    const s = summarizeVisits(visits)
    const amount = computeAmount(payType, w.pay_rate, s)

    return {
      worker: { id: w.id, name: w.name, type: w.type, pay_type: payType, pay_rate: w.pay_rate },
      visits,
      visitCount: s.visitCount,
      hours: s.hours,
      workDays: s.workDays,
      amount,
    }
  })
}
