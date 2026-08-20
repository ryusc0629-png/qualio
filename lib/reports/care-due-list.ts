import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 관리 시점이 된 현장 — 작업 보고서에 적어둔 '앞으로 손봐야 할 것'의 때가 온 고객.
 * (기한을 '계산'하는 건 care-due.ts, 기한이 된 것을 '모아오는' 건 여기)
 *
 * 왜 필요한가: 이 신호는 지금까지 대표폰 푸시(cron care-reminder)로만 나갔다.
 * 푸시를 안 켰거나 알림 하나를 지나치면 그걸로 끝이라, 그 현장 기록을 근거로 먼저
 * 연락할 기회가 조용히 사라졌다. 푸시는 '그 순간'을 알리고, 이 함수는 '아직 안 한 일'을
 * 홈에 남겨두는 용도다.
 *
 * ⚠️ `care_notified_at`으로 거르지 말 것. 그건 푸시를 보냈다는 뜻이지 사장님이 연락했다는
 * 뜻이 아니다. 그걸로 거르면 푸시가 나가는 순간 홈에서 사라져 아무 소용이 없다.
 * 사라지는 기준은 결과로 본다 — 그 고객에게 **앞으로 잡힌 방문이 생기면** 빠진다.
 */

export interface CareDueCustomer {
  customerId: string
  customerName: string
  /** 보고서에 적힌 관리 소견 (홈에는 첫 줄만 한 줄로 들어간다) */
  advice: string
}

interface ReportRow {
  id: string
  care_advice: string | null
  care_due_at: string | null
  bookings:
    | { customer_name: string | null; customer_id: string | null }
    | { customer_name: string | null; customer_id: string | null }[]
    | null
}

export async function getCareDueCustomers(
  db: SupabaseClient,
  businessId: string,
  now: Date,
): Promise<CareDueCustomer[]> {
  const { data: due } = (await db
    .from('reports')
    .select('id, care_advice, care_due_at, bookings!booking_id(customer_name, customer_id)')
    .eq('business_id', businessId)
    .lte('care_due_at', now.toISOString())
    .not('care_advice', 'is', null)
    .order('care_due_at', { ascending: true })
    .limit(50)) as unknown as { data: ReportRow[] | null }

  if (!due || due.length === 0) return []

  // 고객 한 명이 여러 번 걸릴 수 있다 — 가장 오래된 소견 하나만 남긴다
  const byCustomer = new Map<string, CareDueCustomer>()
  for (const r of due) {
    const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings
    const advice = r.care_advice?.trim()
    if (!b?.customer_id || !advice) continue
    if (byCustomer.has(b.customer_id)) continue
    byCustomer.set(b.customer_id, {
      customerId: b.customer_id,
      customerName: b.customer_name?.trim() || '고객',
      advice: advice.split('\n')[0].trim(),
    })
  }

  if (byCustomer.size === 0) return []

  // 앞으로 잡힌 방문이 있으면 이미 연락이 닿은 것으로 보고 뺀다
  const { data: upcoming } = (await db
    .from('bookings')
    .select('customer_id')
    .eq('business_id', businessId)
    .in('customer_id', [...byCustomer.keys()])
    .gte('scheduled_at', now.toISOString())
    .is('deleted_at', null)
    .not('status', 'in', '("cancelled","no_show")')) as unknown as {
    data: { customer_id: string | null }[] | null
  }

  for (const b of upcoming ?? []) {
    if (b.customer_id) byCustomer.delete(b.customer_id)
  }

  return [...byCustomer.values()]
}
