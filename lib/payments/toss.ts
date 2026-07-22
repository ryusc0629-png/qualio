import { getPlanPrice, PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { parsePaymentId } from './provider'

type ConfirmResult =
  | { ok: true; businessId: string; planId: PlanId; amount: number; paymentKey: string }
  | { ok: false; error: string }

// 토스페이먼츠 결제 승인 API 호출 + 금액 위변조 검증.
// 토스 결제창은 성공 시 successUrl로 리다이렉트하며, 서버가 승인 API를 호출해야
// 결제가 최종 완료된다.
export async function confirmTossPayment(params: {
  paymentKey: string
  orderId: string
  amount: number
}): Promise<ConfirmResult> {
  const { paymentKey, orderId, amount } = params

  const parsed = parsePaymentId(orderId)
  if (!parsed) return { ok: false, error: '주문 정보가 올바르지 않습니다' }

  const planId = parsed.planId as PlanId
  if (!PLANS[planId]) return { ok: false, error: '유효하지 않은 플랜입니다' }
  const expected = getPlanPrice(planId)

  // 리다이렉트로 넘어온 금액이 플랜 금액과 다르면 승인 자체를 막는다.
  if (amount !== expected) {
    console.error('[Payment] 토스 요청 금액 불일치:', { amount, expected })
    return { ok: false, error: '결제 금액이 올바르지 않습니다' }
  }

  const secretKey = process.env.TOSSPAYMENTS_SECRET_KEY
  if (!secretKey) {
    console.error('[Payment] TOSSPAYMENTS_SECRET_KEY 환경변수 없음')
    return { ok: false, error: '결제 설정 오류입니다' }
  }
  // 토스 승인 API는 시크릿키를 Basic 인증으로 사용한다(뒤에 콜론 필수).
  const basic = Buffer.from(`${secretKey}:`).toString('base64')

  const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  })

  const payment = (await res.json().catch(() => ({}))) as {
    status?: string
    totalAmount?: number
    message?: string
  }
  if (!res.ok) {
    console.error('[Payment] 토스 결제 승인 실패:', payment)
    return { ok: false, error: payment.message ?? '결제 승인에 실패했습니다' }
  }
  if (payment.status !== 'DONE') {
    console.error('[Payment] 토스 결제 미완료 상태:', payment.status)
    return { ok: false, error: '결제가 완료되지 않았습니다' }
  }
  if (payment.totalAmount !== expected) {
    console.error('[Payment] 토스 승인 금액 불일치:', { paid: payment.totalAmount, expected })
    return { ok: false, error: '결제 금액이 올바르지 않습니다' }
  }

  return { ok: true, businessId: parsed.businessId, planId, amount: expected, paymentKey }
}
