// 도급 정산에 필요한 그 달 현장·계약 데이터를 모아 도급사별 계산 결과로 만든다. 서버 전용.
//
// 귀속 규칙(왜 이렇게 나누는가):
//  - 정기청소: 매출은 contracts.contract_price(월정액)에 있다. 그 달에 방문이 있는 계약의 월정액을
//    '한 번만' 센다. 한 계약의 그 달 방문을 두 도급사가 나눠 맡았으면 방문 수 비율로 쪼갠다
//    (쪼갠 몫의 합은 항상 월정액과 정확히 같다). 배정된 도급사가 아무도 없으면 계약의 기본 도급사에게 준다.
//  - 일회성: 예약마다 금액이 있고(final_price) '완료'로 찍힌 현장만 센다. 여러 도급사가 함께 갔으면 균등 분할.
//  - 사장님이 직접 한 현장(도급사 미배정)은 어느 도급사에도 귀속되지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { marketDayRange, toMarketYmd } from '@/lib/format/datetime'
import type { SubcontractorContractData } from '@/lib/contract/subcontractor-contract'
import {
  computeSettlement,
  splitByVisits,
  type OneOffLine,
  type RecurringLine,
  type SettlementResult,
} from '@/lib/finance/subcontract-settlement'

export interface ContractorSettlement {
  workerId: string
  workerName: string
  color: string
  hasContract: boolean
  signed: boolean
  recurring: RecurringLine[]
  oneOff: OneOffLine[]
  result: SettlementResult
  /** 장부에 이미 확정 기입된 달인지 */
  posted: boolean
}

type WorkerRow = {
  id: string
  name: string
  color: string | null
  contract_data: SubcontractorContractData | null
  contract_signed_at: string | null
}

type BookingRow = {
  id: string
  contract_id: string | null
  final_price: number | null
  status: string
  scheduled_at: string
  customer_name: string
}

type ContractRow = {
  id: string
  contract_price: number | null
  start_date: string | null
  end_date: string | null
  customer_id: string | null
  default_worker_id: string | null
}

/** 'YYYY-MM' → 그 달의 첫날·마지막날(KST 달력) */
function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, '0')}` }
}

/**
 * 그 달 도급사별 정산 내역. 도급사가 없으면 빈 배열.
 *
 * eslint-disable 이유: workers·booking_workers는 lib/types/database.ts에 아직 반영되지 않은
 * 테이블이라 프로젝트 컨벤션대로 `as never` + `as unknown as` 로 타입을 단언한다.
 */
export async function loadContractorSettlements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  businessId: string,
  month: string,
): Promise<ContractorSettlement[]> {
  const { first, last } = monthBounds(month)
  const { from, to } = marketDayRange(first, last)

  const [workersRes, bookingsRes, contractsRes, postedRes] = await Promise.all([
    db
      .from('workers' as never)
      .select('id, name, color, contract_data, contract_signed_at')
      .eq('business_id' as never, businessId)
      .eq('type' as never, 'contractor')
      .eq('is_active' as never, true)
      .order('created_at' as never) as unknown as Promise<{ data: WorkerRow[] | null }>,

    db
      .from('bookings')
      .select('id, contract_id, final_price, status, scheduled_at, customer_name' as never)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('scheduled_at', from)
      .lte('scheduled_at', to) as unknown as Promise<{ data: BookingRow[] | null }>,

    db
      .from('contracts')
      .select('id, contract_price, start_date, end_date, customer_id, default_worker_id' as never)
      .eq('business_id', businessId) as unknown as Promise<{ data: ContractRow[] | null }>,

    db
      .from('finance_entries')
      .select('source_key' as never)
      .eq('business_id', businessId)
      .like('source_key' as never, `subcontract:%:${month}:%`) as unknown as Promise<{
        data: { source_key: string }[] | null
      }>,
  ])

  const workers = workersRes.data ?? []
  if (workers.length === 0) return []

  const bookings = bookingsRes.data ?? []
  const contracts = contractsRes.data ?? []
  const postedKeys = new Set((postedRes.data ?? []).map((r) => r.source_key))

  // 그 달 예약에 배정된 인력 — 도급사만 골라 쓴다
  const bookingIds = bookings.map((b) => b.id)
  const assignedByBooking = new Map<string, string[]>()
  if (bookingIds.length > 0) {
    const { data: links } = (await db
      .from('booking_workers' as never)
      .select('booking_id, worker_id')
      .in('booking_id' as never, bookingIds)) as unknown as {
        data: { booking_id: string; worker_id: string }[] | null
      }
    const contractorIds = new Set(workers.map((w) => w.id))
    for (const l of links ?? []) {
      if (!contractorIds.has(l.worker_id)) continue
      const list = assignedByBooking.get(l.booking_id) ?? []
      list.push(l.worker_id)
      assignedByBooking.set(l.booking_id, list)
    }
  }

  // 거래처 이름 — 정기계약 줄에 표시용
  const customerIds = [...new Set(contracts.map((c) => c.customer_id).filter((v): v is string => !!v))]
  const customerNames = new Map<string, string>()
  if (customerIds.length > 0) {
    const { data: customers } = await db
      .from('customers')
      .select('id, name')
      .in('id', customerIds)
    for (const cu of customers ?? []) customerNames.set(cu.id, cu.name)
  }

  const recurringByWorker = new Map<string, RecurringLine[]>()
  const oneOffByWorker = new Map<string, OneOffLine[]>()
  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key) ?? []
    list.push(value)
    map.set(key, list)
  }

  // ── 정기청소: 계약별로 그 달 방문을 모아 월정액을 배분 ──────────────
  const contractById = new Map(contracts.map((c) => [c.id, c]))
  const visitsByContract = new Map<string, BookingRow[]>()
  for (const b of bookings) {
    if (!b.contract_id) continue
    push(visitsByContract, b.contract_id, b)
  }

  for (const [contractId, visits] of visitsByContract) {
    const c = contractById.get(contractId)
    const price = c?.contract_price ?? 0
    if (!c || price <= 0) continue

    // 그 달에 계약이 살아있었는지 — 종료된 계약의 잔여 예약까지 매출로 세지 않는다
    if (c.start_date && c.start_date > last) continue
    if (c.end_date && c.end_date < first) continue

    const clientName = (c.customer_id && customerNames.get(c.customer_id)) || '거래처'

    // 이 계약의 그 달 방문을 맡은 도급사별 방문 수
    const counts = new Map<string, number>()
    for (const v of visits) {
      for (const wid of assignedByBooking.get(v.id) ?? []) {
        counts.set(wid, (counts.get(wid) ?? 0) + 1)
      }
    }

    if (counts.size > 0) {
      const ids = [...counts.keys()]
      const amounts = splitByVisits(price, ids.map((id) => counts.get(id) ?? 0))
      ids.forEach((wid, i) => {
        push(recurringByWorker, wid, {
          contractId,
          clientName,
          amount: amounts[i],
          visits: counts.get(wid) ?? 0,
          monthlyPrice: price,
        })
      })
    } else if (c.default_worker_id && workers.some((w) => w.id === c.default_worker_id)) {
      // 방문에 아무도 배정되지 않았지만 계약의 기본 도급사가 있으면 그 도급사 몫
      push(recurringByWorker, c.default_worker_id, {
        contractId,
        clientName,
        amount: price,
        visits: visits.length,
        monthlyPrice: price,
      })
    }
  }

  // ── 일회성: 완료된 현장만, 함께 간 도급사끼리 균등 분할 ─────────────
  for (const b of bookings) {
    if (b.contract_id) continue
    if (b.status !== 'completed') continue
    const amount = Math.round(b.final_price ?? 0)
    if (amount <= 0) continue

    const ids = assignedByBooking.get(b.id) ?? []
    if (ids.length === 0) continue

    const amounts = splitByVisits(amount, ids.map(() => 1))
    ids.forEach((wid, i) => {
      push(oneOffByWorker, wid, {
        bookingId: b.id,
        clientName: b.customer_name,
        amount: amounts[i],
        date: toMarketYmd(b.scheduled_at),
      })
    })
  }

  return workers.map((w) => {
    const recurring = recurringByWorker.get(w.id) ?? []
    const oneOff = oneOffByWorker.get(w.id) ?? []
    return {
      workerId: w.id,
      workerName: w.name,
      color: w.color ?? '#64748b',
      hasContract: !!w.contract_data,
      signed: !!w.contract_signed_at,
      recurring,
      oneOff,
      result: computeSettlement({ contract: w.contract_data, recurring, oneOff }),
      posted: postedKeys.has(`subcontract:${w.id}:${month}:pay`),
    }
  })
}
