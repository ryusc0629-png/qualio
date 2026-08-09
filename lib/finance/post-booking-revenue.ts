import type { SupabaseClient } from '@supabase/supabase-js'

// ISO 시각 → KST 날짜 문자열(YYYY-MM-DD)
function kstDate(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

// 완료된 '일회성' 예약의 매출을 장부(finance_entries)에 자동 반영한다.
// - 정기계약(contract_id 있음)은 월말 정산이라 제외(월 청구와 이중 계상 방지)
// - final_price가 0 이하이면 제외
// - 같은 예약은 [매출:bookingId] 태그로 delete-then-insert 하여 멱등(중복 방지)
//   → 완료를 여러 번 눌러도, 금액이 바뀌어도 장부엔 항상 1건만 남는다.
export async function postBookingRevenue(
  db: SupabaseClient,
  businessId: string,
  bookingId: string,
): Promise<void> {
  const { data: b } = await db
    .from('bookings')
    .select('final_price, contract_id, customer_name, scheduled_at, status' as never)
    .eq('id', bookingId)
    .eq('business_id', businessId)
    .maybeSingle() as unknown as {
      data: {
        final_price: number | null
        contract_id: string | null
        customer_name: string | null
        scheduled_at: string
        status: string
      } | null
    }

  if (!b || b.status !== 'completed' || b.contract_id) return
  const amount = Math.round(b.final_price ?? 0)
  if (amount <= 0) return

  const tag = `[매출:${bookingId}]`
  await db
    .from('finance_entries')
    .delete()
    .eq('business_id', businessId)
    .eq('type', 'revenue')
    .like('memo', `%${tag}%`)

  await db.from('finance_entries').insert({
    business_id: businessId,
    entry_date: kstDate(b.scheduled_at),
    type: 'revenue',
    category: '작업 매출',
    amount,
    memo: `${b.customer_name ?? '고객'} 작업 완료 ${tag}`,
  } as never)
}
