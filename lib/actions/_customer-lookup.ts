import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { normalizePhone } from '@/lib/format/phone'

type DB = SupabaseClient<Database>

/**
 * 전화번호로 기존 고객 카드를 찾는다 — 하이픈/공백 차이를 무시하고 '숫자만'으로 비교한다.
 *
 * 왜: 같은 고객이라도 법인 카드는 010-5526-5406, 예약은 01055265406처럼
 * 형식이 달라 exact match(.eq('phone', ...))로는 못 찾아 개인 고객 카드가 하나 더
 * 생기던 문제(예: 법인 고객의 일회성 대청소 예약)를 막는다.
 *
 * @returns 일치하는 고객 id, 없으면 null
 */
export async function findCustomerIdByPhone(
  db: DB,
  businessId: string,
  phone: string | null | undefined,
): Promise<string | null> {
  const digits = normalizePhone(phone)
  if (!digits) return null

  const { data } = await db
    .from('customers')
    .select('id, phone')
    .eq('business_id', businessId)

  const match = (data ?? []).find((c) => normalizePhone(c.phone) === digits)
  return match?.id ?? null
}
