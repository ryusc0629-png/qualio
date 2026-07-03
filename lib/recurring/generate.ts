import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeVisitDates } from './visit-dates'

// 정기계약 → 미래 방문(bookings) 자동 생성. 계약 등록 시 + 매일 크론에서 호출한다.
// last_generated_until 커서로 멱등 보장 — 이미 생성한 날짜 이후만 새로 만들어,
// 사장님이 일정에서 지운 방문을 다음 실행 때 되살리지 않는다.

const HORIZON_DAYS = 60 // 오늘부터 60일치를 미리 깔아둔다 (크론이 매일 한 칸씩 전진)
const VISIT_HOUR_KST = 9 // 시간 미지정 — 오전 9시로 깔고 사장님이 일정에서 조정

export interface ContractForGen {
  id: string
  business_id: string
  customer_id: string
  service_type: string | null
  frequency: string
  start_date: string
  end_date: string | null
  status: string
  last_generated_until: string | null
  default_worker_id?: string | null // 거래처 고정 담당자 — 있으면 새 방문을 이 사람에게 바로 배정
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

/**
 * 한 계약의 향후 방문을 생성한다. 생성한 방문 수를 반환.
 * 활성(active) 계약만 생성한다.
 */
export async function generateVisitsForContract(
  db: SupabaseClient,
  contract: ContractForGen,
): Promise<number> {
  if (contract.status !== 'active') return 0

  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayStr = ymd(nowKST)
  const horizonStr = ymd(addDays(nowKST, HORIZON_DAYS))

  // 생성 시작점: 마지막 생성일 다음날, 없으면 max(계약 시작일, 오늘) — 과거 방문은 만들지 않음
  let fromStr: string
  if (contract.last_generated_until) {
    fromStr = ymd(addDays(new Date(`${contract.last_generated_until}T00:00:00Z`), 1))
  } else {
    fromStr = contract.start_date > todayStr ? contract.start_date : todayStr
  }

  // 종료점: 롤링 윈도우 끝, 계약 종료일이 더 이르면 그걸로 제한
  let toStr = horizonStr
  if (contract.end_date && contract.end_date < toStr) toStr = contract.end_date

  if (fromStr > toStr) return 0

  const dates = computeVisitDates(contract.frequency, fromStr, toStr)
  if (dates.length === 0) {
    // 생성할 날짜가 없어도 커서는 전진시켜 다음 실행에서 같은 구간을 재검토하지 않게 함
    await db.from('contracts').update({ last_generated_until: toStr }).eq('id', contract.id)
    return 0
  }

  // 고객 정보 (방문 카드에 표시할 이름·연락처·주소)
  const { data: customer } = await db
    .from('customers')
    .select('name, phone, address')
    .eq('id', contract.customer_id)
    .maybeSingle()
  if (!customer) return 0

  // 같은 계약으로 이미 만든 방문 날짜는 건너뜀 (커서로 충분하지만 방어적으로 한 번 더)
  const { data: existing } = await db
    .from('bookings')
    .select('scheduled_at')
    .eq('contract_id', contract.id)
  const existingDates = new Set(
    (existing ?? []).map((b: { scheduled_at: string }) => ymd(new Date(b.scheduled_at))),
  )

  const hour = String(VISIT_HOUR_KST).padStart(2, '0')
  const defaultWorkerId = contract.default_worker_id ?? null
  const rows = dates
    .filter((d) => !existingDates.has(d))
    .map((d) => ({
      business_id: contract.business_id,
      customer_id: contract.customer_id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      service_address: customer.address ?? '',
      scheduled_at: new Date(`${d}T${hour}:00:00+09:00`).toISOString(),
      selected_tier: 'good',
      final_price: 0, // 월정액 계약이라 방문 단건 과금 없음 (매출·LTV 이중계상 방지)
      status: 'confirmed',
      memo: `정기계약 · ${contract.service_type ?? '청소'}`,
      contract_id: contract.id,
      worker_id: defaultWorkerId, // 고정 담당자가 있으면 새 방문을 바로 배정
    }))

  if (rows.length > 0) {
    const { data: inserted } = await db
      .from('bookings')
      .insert(rows)
      .select('id')

    // 고정 담당자가 있으면 booking_workers도 함께 채워 다중배정 UI와 정합성 유지
    if (defaultWorkerId && inserted && inserted.length > 0) {
      await db.from('booking_workers').insert(
        (inserted as { id: string }[]).map((b) => ({
          booking_id: b.id,
          worker_id: defaultWorkerId,
          is_lead: true,
        })),
      )
    }
  }

  // 커서 전진
  await db.from('contracts').update({ last_generated_until: toStr }).eq('id', contract.id)

  return rows.length
}
