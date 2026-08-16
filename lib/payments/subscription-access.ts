import { IS_RECURRING_BILLING } from '@/lib/config/billing'

// 구독 접근 판정 단일 소스.
// 대시보드 페이월(app/(dashboard)/dashboard/layout.tsx)과 결제 페이지(app/upgrade/page.tsx)가
// 서로 다른 기준을 쓰면 "대시보드는 튕기는데 결제창은 결제 안 해도 된다고 하는" 어긋남이 생긴다.
// 판정이 필요한 곳은 반드시 이 파일의 evaluateSubscription()만 쓸 것.

export interface SubscriptionRow {
  plan: string | null
  status: string | null
  current_period_end: string | null
}

export interface SubscriptionAccess {
  /** 무료 베타 플랜(또는 구독 행 자체가 없음) */
  isBeta: boolean
  /** 유료 이용기간이 끝났는지 */
  expired: boolean
  /** 결제가 필요한 상태 — 베타이거나 만료 */
  needsPayment: boolean
  /** 대시보드 이용 가능 여부 */
  allowed: boolean
}

// 자동청구(정기결제)가 하루이틀 늦어도 정상 결제 고객이 잠기지 않도록 두는 여유 기간.
// 단건 결제 모드에는 자동청구 자체가 없으므로 여유를 두지 않는다.
const GRACE_DAYS = IS_RECURRING_BILLING ? 3 : 0

// 카드 청구 실패(past_due)는 재시도·안내 여지를 남긴다 — 실패하자마자 서비스를 끊지 않는다.
const PAST_DUE_GRACE_DAYS = 7

// 유료 이용기간이 끝났는지 판정한다.
function isPaidPeriodOver(sub: SubscriptionRow | null): boolean {
  if (!sub) return true
  // 무료 베타는 '만료'가 아니라 아직 결제를 안 한 상태다
  if (!sub.plan || sub.plan === 'beta') return false
  // 기간이 비어 있으면 본사가 직접 부여한 무기한 계정 — 만료시키지 않는다.
  // (실제 결제를 거치면 activateSubscription이 항상 기간을 채우므로, 여기 걸리는 건 수동 부여분뿐)
  if (!sub.current_period_end) return false

  const end = new Date(sub.current_period_end)
  if (Number.isNaN(end.getTime())) return false

  const graceDays = sub.status === 'past_due' ? PAST_DUE_GRACE_DAYS : GRACE_DAYS
  const deadline = new Date(end)
  deadline.setDate(deadline.getDate() + graceDays)

  return deadline < new Date()
}

// 구독 행 하나로 접근 권한·결제 필요 여부를 한 번에 판정한다.
// ⚠️ status가 'active'라도 이용기간이 지났으면 만료로 본다 —
//    단건 결제 모드에는 active를 expired로 바꿔주는 코드가 없어서,
//    status만 보면 1회 결제로 영원히 쓸 수 있게 된다.
export function evaluateSubscription(sub: SubscriptionRow | null): SubscriptionAccess {
  const isBeta = !sub || !sub.plan || sub.plan === 'beta'
  const expired = isPaidPeriodOver(sub)
  const needsPayment = isBeta || expired

  return { isBeta, expired, needsPayment, allowed: !needsPayment }
}
