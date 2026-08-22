import type { SupabaseClient } from '@supabase/supabase-js'

// 오늘(KST) 문단속 현장의 도착·마감 현황을 계산하는 공용 로직.
// 대표용 현황 페이지(attendance)와 홈 대시보드 카드가 같은 값을 쓰도록 한곳에 모은다.

// 마감 예상 시각 = 도착 + 예상소요시간 + 버퍼. 이 시각을 넘겨도 마감이 없으면 '확인 필요'.
export const LOCKUP_BUFFER_MINUTES = 30
export const LOCKUP_DEFAULT_DURATION_MINUTES = 120

export type LockupVisitStatus = 'not_arrived' | 'working' | 'overdue' | 'done'

export type ChecklistItem = { id: string; label: string }

export type LockupVisit = {
  id: string
  customer_name: string | null
  service_address: string | null
  scheduled_at: string
  worker_id: string | null
  contract_id: string | null
  checkin_at: string | null
  checkout_at: string | null
  open_photo_urls: string[] | null
  lockup_photo_urls: string[] | null
  // GPS — 도착 위치와 현장(주소 지오코딩) 좌표
  checkin_lat: number | null
  checkin_lng: number | null
  site_lat: number | null
  site_lng: number | null
  // 작업 체크리스트 진행 { itemId: [url] }
  checklist_photos: Record<string, string[]> | null
}

export interface TodayLockupData {
  hasContracts: boolean // 오늘 지켜볼 계약(문단속 또는 작업 항목)이 하나라도 있는지
  visits: LockupVisit[]
  durationById: Map<string, number>
  // 계약별 작업 체크리스트 항목
  checklistByContract: Map<string, ChecklistItem[]>
  // 계약별 문단속 사용 여부 — 상태 판정이 갈린다(computeVisitStatus 주석 참고)
  lockupById: Map<string, boolean>
}

// 오늘(KST) 하루 범위의 UTC ISO 문자열
function todayRangeUtc(): { dayStart: string; dayEnd: string } {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayStr = kstNow.toISOString().slice(0, 10)
  return {
    dayStart: new Date(`${todayStr}T00:00:00+09:00`).toISOString(),
    dayEnd: new Date(`${todayStr}T23:59:59+09:00`).toISOString(),
  }
}

// 오늘 문단속 현장 방문 목록 + 계약별 예상소요시간을 가져온다.
export async function getTodayLockupData(
  db: SupabaseClient,
  businessId: string,
): Promise<TodayLockupData> {
  // 1) 오늘 지켜볼 계약 — 문단속을 켰거나, 작업 항목을 정해둔 계약.
  //    ⚠️예전엔 requires_lockup=true만 가져왔다. 그래서 문단속은 안 쓰고 작업 항목만 정한 현장은
  //      '오늘 현장 현황'에 아예 안 떴고, 직원이 올린 항목 사진을 사장님이 볼 화면이 없었다.
  //      두 기능은 독립이다 — 하나만 켜도 오늘 현황에 나와야 한다.
  const { data: contractsRaw } = (await db
    .from('contracts')
    .select('id, expected_duration_minutes, checklist_items, requires_lockup' as never)
    .eq('business_id', businessId)) as unknown as {
    data: {
      id: string
      expected_duration_minutes: number | null
      checklist_items: ChecklistItem[] | null
      requires_lockup: boolean | null
    }[] | null
  }
  const contracts = (contractsRaw ?? []).filter(
    (c) => c.requires_lockup === true || (c.checklist_items?.length ?? 0) > 0,
  )
  const durationById = new Map(
    contracts.map((c) => [c.id, c.expected_duration_minutes ?? LOCKUP_DEFAULT_DURATION_MINUTES]),
  )
  const checklistByContract = new Map(
    contracts.map((c) => [c.id, c.checklist_items ?? []]),
  )
  // 문단속을 켠 계약인지 — 안 켠 곳은 마감 사진이 없어 '미마감'으로 판정하면 안 된다
  const lockupById = new Map(contracts.map((c) => [c.id, c.requires_lockup === true]))

  if (durationById.size === 0) {
    return { hasContracts: false, visits: [], durationById, checklistByContract, lockupById }
  }

  // 2) 오늘 문단속 현장 방문
  const { dayStart, dayEnd } = todayRangeUtc()
  const { data } = (await db
    .from('bookings')
    .select(
      'id, customer_name, service_address, scheduled_at, worker_id, contract_id, checkin_at, checkout_at, open_photo_urls, lockup_photo_urls, checkin_lat, checkin_lng, site_lat, site_lng, checklist_photos' as never,
    )
    .eq('business_id', businessId)
    .in('contract_id' as never, Array.from(durationById.keys()))
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)
    .is('deleted_at' as never, null)
    .not('status', 'in', '("cancelled","no_show")')
    .order('scheduled_at', { ascending: true })) as unknown as { data: LockupVisit[] | null }

  return { hasContracts: true, visits: data ?? [], durationById, checklistByContract, lockupById }
}

// 방문 하나의 상태 판정 (마감됨 / 미도착 / 작업 중 / 미마감 확인 필요)
//
// ⚠️ 문단속을 안 켠 현장(작업 항목만 쓰는 곳)은 도착·마감 사진을 아예 안 올린다
//    (checkin_at·checkout_at은 그 사진을 올릴 때만 찍힌다). 그대로 판정하면 종일 '미도착'으로
//    떠서 화면이 거짓말을 한다. 그런 현장은 '작업 항목을 얼마나 채웠나'로 판정하고,
//    마감 기한이 없으니 '미마감(overdue)'도 절대 붙이지 않는다.
export function computeVisitStatus(
  v: LockupVisit,
  durationById: Map<string, number>,
  nowMs: number,
  opts?: { lockupById?: Map<string, boolean>; checklistByContract?: Map<string, ChecklistItem[]> },
): LockupVisitStatus {
  const cid = v.contract_id ?? ''
  const usesLockup = opts?.lockupById ? opts.lockupById.get(cid) === true : true

  if (!usesLockup) {
    const items = opts?.checklistByContract?.get(cid) ?? []
    if (items.length === 0) return v.checkout_at ? 'done' : 'not_arrived'
    const photos = v.checklist_photos ?? {}
    const filled = items.filter((it) => (photos[it.id] ?? []).length > 0).length
    if (filled === 0) return 'not_arrived'
    return filled === items.length ? 'done' : 'working'
  }

  if (v.checkout_at) return 'done'
  if (!v.checkin_at) return 'not_arrived'
  const dur = durationById.get(cid) ?? LOCKUP_DEFAULT_DURATION_MINUTES
  const deadline = new Date(v.checkin_at).getTime() + (dur + LOCKUP_BUFFER_MINUTES) * 60 * 1000
  return nowMs >= deadline ? 'overdue' : 'working'
}

export interface LockupSummary {
  total: number // 오늘 문단속 현장 수
  done: number // 마감 완료
  overdue: number // 미마감 확인 필요
}

// 방문 목록에서 홈 카드/요약용 집계값을 뽑는다.
export function summarizeLockup(
  visits: LockupVisit[],
  durationById: Map<string, number>,
  nowMs: number,
  opts?: { lockupById?: Map<string, boolean>; checklistByContract?: Map<string, ChecklistItem[]> },
): LockupSummary {
  let done = 0
  let overdue = 0
  for (const v of visits) {
    const s = computeVisitStatus(v, durationById, nowMs, opts)
    if (s === 'done') done += 1
    else if (s === 'overdue') overdue += 1
  }
  return { total: visits.length, done, overdue }
}
