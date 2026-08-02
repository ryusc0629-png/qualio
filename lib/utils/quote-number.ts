import type { createServiceClient } from '@/lib/supabase/server'

// 업체별 견적 번호 다음 순번 계산 — Q-{연도}-{4자리 순번} (연도별로 0001부터)
// 기존 번호 중 최댓값+1을 쓰므로 중간이 삭제돼도 번호가 되돌아가지 않음(중복 방지)
export async function getNextQuoteNumber(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `Q-${year}-`
  const { data } = await db
    .from('b2b_quotes')
    .select('quote_number' as never)
    .eq('business_id', businessId)
    .like('quote_number', `${prefix}%`) as unknown as { data: { quote_number: string | null }[] | null }

  let max = 0
  for (const row of data ?? []) {
    const num = row.quote_number
    if (!num || !num.startsWith(prefix)) continue
    const seq = parseInt(num.slice(prefix.length), 10)
    if (Number.isFinite(seq) && seq > max) max = seq
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}
