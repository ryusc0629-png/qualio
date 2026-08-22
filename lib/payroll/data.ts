import type { SupabaseClient } from '@supabase/supabase-js'
import { loadContractorSettlements } from '@/lib/finance/subcontract-load'
import { SETTLEMENT_LABELS } from '@/lib/contract/subcontractor-contract'
import {
  type PayType,
  type PayrollExtra,
  type PayrollVisit,
  type WorkerPayroll,
  isPayType,
  summarizeVisits,
  computeAmount,
  describeEmployeeBase,
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
type BookingRow = PayrollVisit & { worker_id: string | null; status: string }
type ExtraRow = { id: string; worker_id: string; booking_id: string | null; label: string; amount: number }

const won = (n: number) => n.toLocaleString('ko-KR')

// '8월 17일 · 이승찬' — 추가 지급 줄에 붙는 현장 표시
function bookingLabel(b: { scheduled_at: string; customer_name: string | null }): string {
  const d = new Date(b.scheduled_at).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
  return `${d} · ${b.customer_name ?? '고객'}`
}

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

  // 2) 이 달 예약 — 취소분만 뺀다.
  //    급여 재료(근무시간·일수·건수)는 완료된 것만 쓰지만, '추가 지급'을 붙일 현장 목록에는
  //    아직 완료 체크가 안 된 현장도 나와야 한다(현장 완료 체크가 며칠씩 밀리는 게 보통이다).
  const { data: bookingsRaw } = (await db
    .from('bookings')
    .select('id, scheduled_at, customer_name, service_address, worker_id, checkin_at, checkout_at, status')
    .eq('business_id', businessId)
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .order('scheduled_at', { ascending: true })) as unknown as { data: BookingRow[] | null }
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

  // 4) 추가 지급·공제 줄
  const { data: extraRaw } = (await db
    .from('payroll_entries')
    .select('id, worker_id, booking_id, label, amount' as never)
    .eq('business_id', businessId)
    .eq('month' as never, month)
    .order('created_at', { ascending: true })) as unknown as { data: ExtraRow[] | null }
  const extrasByWorker = new Map<string, PayrollExtra[]>()
  for (const e of extraRaw ?? []) {
    const b = e.booking_id ? bookingById.get(e.booking_id) : undefined
    const list = extrasByWorker.get(e.worker_id) ?? []
    list.push({
      id: e.id,
      label: e.label,
      amount: e.amount,
      bookingId: e.booking_id,
      bookingLabel: b ? bookingLabel(b) : null,
    })
    extrasByWorker.set(e.worker_id, list)
  }

  // 5) 도급사 기본급 — 도급 계약서의 배분 조건으로 이미 계산되는 값을 그대로 쓴다.
  //    급여 화면에서 단가를 또 물으면 두 화면이 서로 다른 금액을 말하게 된다.
  const hasContractor = workers.some((w) => w.type === 'contractor')
  const settlements = hasContractor
    ? await loadContractorSettlements(db, businessId, month)
    : []
  const settlementByWorker = new Map(settlements.map((s) => [s.workerId, s]))

  // 6) 직원별 방문 묶기(직접 배정 worker_id + 팀 배정 booking_workers, 중복 제거) → 계산
  return workers.map((w) => {
    const ids = new Set<string>()
    for (const b of bookings) if (b.worker_id === w.id) ids.add(b.id)
    for (const id of assignmentByWorker.get(w.id) ?? []) ids.add(id)

    const assigned: BookingRow[] = Array.from(ids)
      .map((id) => bookingById.get(id))
      .filter((b): b is BookingRow => !!b)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

    const visits: PayrollVisit[] = assigned
      .filter((b) => b.status === 'completed')
      .map((b) => ({
        id: b.id,
        scheduled_at: b.scheduled_at,
        customer_name: b.customer_name,
        service_address: b.service_address,
        checkin_at: b.checkin_at,
        checkout_at: b.checkout_at,
      }))

    const payType: PayType | null = isPayType(w.pay_type) ? w.pay_type : null
    const s = summarizeVisits(visits)
    const isContractor = w.type === 'contractor'

    let baseAmount: number
    let baseLabel: string
    let baseBlocked: string | null

    if (isContractor) {
      const st = settlementByWorker.get(w.id)
      baseAmount = st?.result.contractorPay ?? 0
      baseBlocked = st?.result.blocked ?? '도급 계약서를 먼저 작성해주세요'
      if (!st || baseBlocked) {
        baseLabel = '도급 계약서의 정산 조건으로 계산돼요'
      } else if (st.result.mode === 'revenue_share' && st.result.sharePercent !== null) {
        baseLabel = `현장 매출 ${won(st.result.revenue)}원의 ${100 - st.result.sharePercent}%`
      } else {
        baseLabel = `${st.result.mode ? SETTLEMENT_LABELS[st.result.mode] : '도급'} · 현장 ${st.result.jobCount}건`
      }
    } else {
      baseAmount = computeAmount(payType, w.pay_rate, s)
      baseLabel = describeEmployeeBase(payType, w.pay_rate, s)
      baseBlocked = payType && w.pay_rate ? null : '급여 방식과 단가를 정해주세요'
    }

    const extras = extrasByWorker.get(w.id) ?? []
    const extraTotal = extras.reduce((sum, e) => sum + e.amount, 0)

    return {
      worker: { id: w.id, name: w.name, type: w.type, pay_type: payType, pay_rate: w.pay_rate },
      visits,
      visitCount: s.visitCount,
      hours: s.hours,
      workDays: s.workDays,
      isContractor,
      baseAmount,
      baseLabel,
      baseBlocked,
      extras,
      extraTotal,
      amount: baseAmount + extraTotal,
      bookingOptions: assigned.map((b) => ({ id: b.id, label: bookingLabel(b) })),
    }
  })
}
