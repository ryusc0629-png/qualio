import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { PLANS, type PlanId } from '@/lib/config/plans'
import { quoteRefund, type RefundQuote } from '@/lib/payments/refund-calc'

// 본사 '환불 처리' 화면 데이터.
//
// 왜 화면으로 두는가: 환불을 포트원 콘솔에서만 하면 우리 DB는 '결제됨'으로 남아
// 본사 장부와 어긋난다. 여기서 처리하면 포트원 취소 + 주문 상태 갱신이 한 번에 된다.
// 금액도 사람이 입력하지 않고 약관(제6조) 규칙을 옮긴 quoteRefund()가 계산한다.

export interface RefundablePayment {
  /** 주문번호 = 포트원 paymentId */
  ordrIdxx: string
  businessId: string
  businessName: string
  planId: string
  planLabel: string
  /** 결제 금액(원) */
  amount: number
  paidAt: string | null
  /** 이용 기간 — 일할 계산의 기준 */
  periodStart: string | null
  periodEnd: string | null
  /** 결제 후 활동 건수 — '이용 내역 확인' 단계의 근거로 보여준다 */
  usageCount: number
  /** 활동이 없다고 보고 산정한 기본 견적(화면 초기값) */
  quote: RefundQuote | null
}

/** 환불 가능한(=결제 완료된) 최근 결제 건 목록 */
export async function getRefundablePayments(limit = 50): Promise<RefundablePayment[]> {
  const db = createServiceClient() as unknown as SupabaseClient

  const { data: orders } = (await db
    .from('kcp_payment_orders')
    .select('ordr_idxx, business_id, plan_id, amount, paid_at')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(limit)) as unknown as {
      data: Array<{
        ordr_idxx: string
        business_id: string
        plan_id: string
        amount: number
        paid_at: string | null
      }> | null
    }

  const rows = orders ?? []
  if (rows.length === 0) return []

  const businessIds = Array.from(new Set(rows.map((r) => r.business_id)))

  const [bizRes, subRes, actRes] = await Promise.all([
    db.from('businesses').select('id, name').in('id', businessIds),
    db.from('subscriptions')
      .select('business_id, current_period_start, current_period_end')
      .in('business_id', businessIds),
    // 결제 후 활동이 있었는지 — 업체별 건수만 세면 되므로 최근 것만 넉넉히 읽는다
    db.from('activity_events')
      .select('business_id, created_at')
      .in('business_id', businessIds)
      .limit(10000),
  ])

  const nameById = new Map<string, string>()
  for (const b of (bizRes.data ?? []) as { id: string; name: string }[]) nameById.set(b.id, b.name)

  const periodById = new Map<string, { start: string | null; end: string | null }>()
  for (const s of (subRes.data ?? []) as Array<{
    business_id: string
    current_period_start: string | null
    current_period_end: string | null
  }>) {
    periodById.set(s.business_id, { start: s.current_period_start, end: s.current_period_end })
  }

  const events = (actRes.data ?? []) as Array<{ business_id: string; created_at: string }>

  return rows.map((r) => {
    const period = periodById.get(r.business_id)
    const planLabel = PLANS[r.plan_id as PlanId]?.label ?? r.plan_id

    // '결제 후' 활동만 센다 — 결제 전 활동은 청약철회 판단과 무관하다
    const usageCount = r.paid_at
      ? events.filter((e) => e.business_id === r.business_id && e.created_at > r.paid_at!).length
      : 0

    const start = period?.start ?? r.paid_at
    const end = period?.end
    const quote = start && end
      ? quoteRefund({
          paidAmount: r.amount,
          periodStart: start,
          periodEnd: end,
          hasUsage: usageCount > 0,
        })
      : null

    return {
      ordrIdxx: r.ordr_idxx,
      businessId: r.business_id,
      businessName: nameById.get(r.business_id) ?? '(이름 없음)',
      planId: r.plan_id,
      planLabel,
      amount: r.amount,
      paidAt: r.paid_at,
      periodStart: start ?? null,
      periodEnd: end ?? null,
      usageCount,
      quote,
    }
  })
}
