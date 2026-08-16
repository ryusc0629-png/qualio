import type { SupabaseClient } from '@supabase/supabase-js'

// 주문 선점(claim) — 같은 결제를 두 경로가 동시에 처리하지 못하게 막는다.
//
// 왜 필요한가: 한 건의 결제가 최대 세 경로로 들어온다.
//   ① 데스크톱 팝업 → /api/payment/confirm
//   ② 모바일 리다이렉트 → /api/payment/portone-return
//   ③ 포트원 웹훅 → /api/payment/portone-webhook
// "status를 읽어보고 pending이면 처리한다"는 방식은 두 요청이 겹치면 둘 다 pending을 읽어
// 구독을 두 번 활성화(최악의 경우 subscriptions 행 중복 생성)한다.
// 아래처럼 update ... where status='pending' 으로 상태를 바꾸면서 동시에 가져오면,
// DB가 한 요청에만 행을 내주므로 먼저 도착한 쪽만 처리한다.

export interface ClaimedOrder {
  business_id: string
  plan_id: string
  amount: number
}

// pending 주문을 paid로 선점한다. 이미 처리됐거나 없는 주문이면 null.
export async function claimPendingOrder(
  db: SupabaseClient,
  ordrIdxx: string,
  extra?: { kcp_tno?: string | null }
): Promise<ClaimedOrder | null> {
  const { data, error } = await db
    .from('kcp_payment_orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      ...(extra?.kcp_tno ? { kcp_tno: extra.kcp_tno } : {}),
    })
    .eq('ordr_idxx', ordrIdxx)
    .eq('status', 'pending')
    .select('business_id, plan_id, amount')
    .maybeSingle()

  if (error) {
    console.error('[Payment] 주문 선점 실패:', ordrIdxx, error)
    return null
  }
  return (data as ClaimedOrder | null) ?? null
}

// 선점 후 구독 활성화가 실패하면 되돌린다 — 그대로 두면 결제는 됐는데
// 아무도 다시 처리할 수 없는 유령 주문이 된다(웹훅 재시도도 막힘).
export async function releaseClaimedOrder(db: SupabaseClient, ordrIdxx: string): Promise<void> {
  const { error } = await db
    .from('kcp_payment_orders')
    .update({ status: 'pending', paid_at: null })
    .eq('ordr_idxx', ordrIdxx)

  if (error) console.error('[Payment] 주문 선점 되돌리기 실패:', ordrIdxx, error)
}
