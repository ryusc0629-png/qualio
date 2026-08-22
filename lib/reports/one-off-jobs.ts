// 정기 거래처에 그 달 따로 한 '일회성 추가 작업' 중 아직 못 받은 건을 읽어온다.
//
// 왜 필요한가: 정기 계약 외에 범위가 늘거나 특별 작업이 생기면 담당자가 청구서를 두 장 받는다.
// 월간 보고서 한 장에 합쳐야 그대로 결재에 올라간다.
//
// ★현금이 급한 곳은 작업 직후 작업 완료 보고서로 먼저 청구하면 된다.
//  그 돈이 들어와 수금 처리되면(paid_amount) 여기서 자동으로 빠지므로 이중 청구가 되지 않는다.
//
// 보고서 화면·발송 전 검토 화면·발송 액션이 모두 이 함수를 쓴다. 세 곳이 다른 숫자를 말하면 안 된다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDate, marketDayRange } from '@/lib/format/datetime'
import { formatAmount } from '@/lib/format/money'
import { monthEndYmd } from '@/lib/quote/invoice'
import type { OneOffJob } from './monthly-charge'

/** 거래처별 일회성 미수 작업 목록. billingMonth는 'YYYY-MM' */
export async function loadOneOffJobs(
  db: SupabaseClient,
  businessId: string,
  customerIds: string[],
  billingMonth: string,
): Promise<Map<string, OneOffJob[]>> {
  const byCustomer = new Map<string, OneOffJob[]>()
  if (customerIds.length === 0) return byCustomer

  const { from, to } = marketDayRange(`${billingMonth}-01`, monthEndYmd(billingMonth))

  const { data: rows } = (await db
    .from('bookings')
    .select('id, customer_id, scheduled_at, final_price, paid_amount, quotes!quote_id(cleaning_type)')
    .eq('business_id', businessId)
    .in('customer_id', customerIds)
    // 정기 방문(contract_id)은 월정액에 이미 들어 있다 — 여기 끼면 이중 청구
    .is('contract_id', null)
    .is('deleted_at', null)
    // 아직 안 한 작업을 청구하지 않는다
    .eq('status', 'completed')
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .order('scheduled_at', { ascending: true })) as unknown as {
    data:
      | Array<{
          id: string
          customer_id: string
          scheduled_at: string
          final_price: number | null
          paid_amount: number | null
          quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
        }>
      | null
  }

  for (const r of rows ?? []) {
    const total = r.final_price ?? 0
    const paid = r.paid_amount ?? 0
    const unpaid = total - paid
    // 이미 받은 작업은 청구하지 않는다(작업 직후 청구해 입금된 건)
    if (total <= 0 || unpaid <= 0) continue

    const quote = Array.isArray(r.quotes) ? r.quotes[0] : r.quotes
    const day = formatDate(r.scheduled_at, { month: 'long', day: 'numeric' })
    const list = byCustomer.get(r.customer_id) ?? []
    list.push({
      label: `${day} ${quote?.cleaning_type?.trim() || '추가 작업'}`,
      amount: unpaid,
      // 선금을 받은 건만 근거를 적는다 — 전액 미수면 줄만 늘어난다
      note: paid > 0 ? `총 ${formatAmount(total)}원 중 ${formatAmount(paid)}원 받음` : undefined,
    })
    byCustomer.set(r.customer_id, list)
  }

  return byCustomer
}
