import { getPlanPrice, PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { parsePaymentId } from './provider'

type VerifyResult =
  | { ok: true; businessId: string; planId: PlanId; amount: number; paymentKey: string }
  | { ok: false; error: string }

// 포트원(PortOne) V2 서버 API로 결제 내역을 조회해 상태·금액 위변조를 검증한다.
// 데스크톱 팝업 흐름(confirm)과 모바일 리다이렉트 흐름(portone-return)에서 공용으로 쓴다.
export async function verifyPortOnePayment(paymentId: string): Promise<VerifyResult> {
  const parsed = parsePaymentId(paymentId)
  if (!parsed) return { ok: false, error: '주문 정보가 올바르지 않습니다' }

  const planId = parsed.planId as PlanId
  if (!PLANS[planId]) return { ok: false, error: '유효하지 않은 플랜입니다' }
  const expected = getPlanPrice(planId)

  const apiSecret = process.env.PORTONE_V2_API_SECRET
  if (!apiSecret) {
    console.error('[Payment] PORTONE_V2_API_SECRET 환경변수 없음')
    return { ok: false, error: '결제 설정 오류입니다' }
  }

  const res = await fetch(
    `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `PortOne ${apiSecret}` } }
  )
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string }
    console.error('[Payment] 포트원 결제 조회 실패:', err)
    return { ok: false, error: err.message ?? '결제 확인에 실패했습니다' }
  }

  const payment = (await res.json()) as { status?: string; amount?: { total?: number } }
  if (payment.status !== 'PAID') {
    console.error('[Payment] 포트원 결제 미완료 상태:', payment.status)
    return { ok: false, error: '결제가 완료되지 않았습니다' }
  }
  if (payment.amount?.total !== expected) {
    console.error('[Payment] 포트원 결제 금액 불일치:', {
      paid: payment.amount?.total,
      expected,
    })
    return { ok: false, error: '결제 금액이 올바르지 않습니다' }
  }

  return { ok: true, businessId: parsed.businessId, planId, amount: expected, paymentKey: paymentId }
}

type ChargeResult = { ok: true; amount: number } | { ok: false; error: string }

// 발급된 빌링키로 서버에서 정기결제(자동결제)를 청구한다.
// 첫 결제와 매월 자동청구(cron) 양쪽에서 공용으로 쓴다.
// 금액은 서버가 플랜 기준으로 결정하므로 클라이언트가 조작할 수 없다.
// POST https://api.portone.io/payments/{paymentId}/billing-key
export async function chargeBillingKey(params: {
  paymentId: string // 짧은 주문번호 (KCP paymentId ≤40자·영숫자)
  billingKey: string
  planId: PlanId
  orderName: string
  customer?: { id?: string; phoneNumber?: string; email?: string }
}): Promise<ChargeResult> {
  const { paymentId, billingKey, planId, orderName, customer } = params
  if (!PLANS[planId]) return { ok: false, error: '유효하지 않은 플랜입니다' }
  const amount = getPlanPrice(planId)

  const apiSecret = process.env.PORTONE_V2_API_SECRET
  if (!apiSecret) {
    console.error('[Payment] PORTONE_V2_API_SECRET 환경변수 없음')
    return { ok: false, error: '결제 설정 오류입니다' }
  }

  const res = await fetch(
    `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`,
    {
      method: 'POST',
      headers: {
        Authorization: `PortOne ${apiSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        billingKey,
        orderName,
        // KCP는 결제 시 customer(id·전화·이메일)를 요구할 수 있음
        customer: customer
          ? { id: customer.id, phoneNumber: customer.phoneNumber, email: customer.email }
          : undefined,
        amount: { total: amount },
        currency: 'KRW',
      }),
    }
  )

  const body = (await res.json().catch(() => ({}))) as { message?: string }
  if (!res.ok) {
    console.error('[Payment] 포트원 빌키 결제 실패:', body)
    return { ok: false, error: body.message ?? '정기결제 승인에 실패했습니다' }
  }

  return { ok: true, amount }
}
