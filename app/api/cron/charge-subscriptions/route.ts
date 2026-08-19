import { NextRequest, NextResponse } from 'next/server'
import { chargeDueSubscriptions } from '@/lib/payments/billing-charge'

// Vercel Cron(daily-maintenance에서 호출):
// 이용기간이 끝난 정기결제 구독을 저장된 빌키로 재청구한다.
//
// 왜 필요한가:
// 카드 등록(빌키 발급) 시점에 첫 달만 결제되고, 그 뒤로는 아무도 청구하지 않았다.
// 즉 둘째 달부터 요금이 빠지지 않고 구독이 조용히 만료됐다. 이 라우트가 그 구멍을 메운다.
//
// ⚠️ 실패한 구독은 status='past_due'로 바뀌어 다음 실행부터 조회에서 빠진다.
//    카드 오류·한도 초과 등은 사장님이 보고 손을 써야 하는 건이라 자동 재시도하지 않는다.
// ⚠️ 중복 청구 방지는 chargeDueSubscriptions() 안에서 주문번호(구독×이용기간) 선점으로 처리한다.
//    여기서 또 막을 필요는 없지만, 이 라우트를 여러 번 불러도 돈이 두 번 빠지지 않는다는 뜻이다.

export const dynamic = 'force-dynamic'
// 청구는 업체마다 외부 결제 API를 순차 호출하므로 시간을 넉넉히 준다
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await chargeDueSubscriptions()
    // 결과는 로그로도 남긴다 — 실패가 생겼는데 아무도 모르는 상황을 막는다
    if (summary.failed > 0) {
      console.error('[Cron charge-subscriptions] 청구 실패 발생:', summary)
    }
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    console.error('[Cron charge-subscriptions] 예외:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
