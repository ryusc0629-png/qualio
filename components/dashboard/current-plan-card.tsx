import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PLANS, formatPrice, formatPriceWithVat } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { applyLifetimeDiscount } from '@/lib/config/beta'
import { CalendarClock } from 'lucide-react'
import { CancelPlanChangeButton } from './cancel-plan-change-button'

interface CurrentPlanCardProps {
  planId: PlanId
  currentPeriodEnd: string | null
  status: string
  nextPlan?: string | null
  /** 이 업체에 붙은 평생 할인율(%) — businesses.lifetime_discount_rate. 0이면 안내를 띄우지 않는다 */
  lifetimeDiscountRate?: number
  /** 베타 순번 — 정원(100팀)이 찬 뒤 가입한 업체는 null이라 안내가 사라진다 */
  betaNumber?: number | null
}

// 현재 구독 플랜 표시 카드 (설정 페이지용)
export function CurrentPlanCard({
  planId,
  currentPeriodEnd,
  status,
  nextPlan,
  lifetimeDiscountRate = 0,
  betaNumber = null,
}: CurrentPlanCardProps) {
  const plan = PLANS[planId] ?? PLANS.beta

  // 만료일 포맷
  const periodEndLabel = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Seoul',
      })
    : null

  const isBeta = planId === 'beta'
  const isPaid = !isBeta
  const hasLifetimeDiscount = lifetimeDiscountRate > 0

  // 예약된 다음 플랜
  const hasScheduledChange = nextPlan && nextPlan !== planId
  const nextPlanLabel = hasScheduledChange ? PLANS[nextPlan as PlanId]?.label : null

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">구독 플랜</h2>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
          status === 'active'
            ? 'bg-green-100 text-green-700'
            : status === 'past_due'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-muted text-muted-foreground'
        }`}>
          {status === 'active' ? '활성' : status === 'past_due' ? '결제 필요' : '해지됨'}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xl font-bold">{plan.label} 플랜</p>
          {/* 할인이 붙은 업체에 정가만 보여주면 실제 청구액과 어긋나 보인다 — 정가에 취소선, 실제 금액을 크게 */}
          <p className="text-sm text-muted-foreground mt-0.5">
            {isBeta ? '무료 베타 기간' : hasLifetimeDiscount ? (
              <>
                <span className="line-through mr-1.5">{formatPrice(plan.price)}</span>
                <span className="text-foreground font-semibold">
                  {formatPrice(applyLifetimeDiscount(plan.price, lifetimeDiscountRate))}
                </span>
                <span className="ml-1">(부가세 별도)</span>
              </>
            ) : (
              <>
                {formatPrice(plan.price)} <span>(부가세 별도)</span>
              </>
            )}
          </p>
          {/* 실제로 카드에서 빠지는 금액 — 통장 내역과 대조할 때 이 숫자를 본다 */}
          {!isBeta && (
            <p className="text-xs text-muted-foreground mt-0.5">
              매달 결제되는 금액{' '}
              <b className="text-foreground">
                {formatPriceWithVat(
                  hasLifetimeDiscount ? applyLifetimeDiscount(plan.price, lifetimeDiscountRate) : plan.price
                )}
              </b>
            </p>
          )}
          {isPaid && periodEndLabel && (
            <p className="text-xs text-muted-foreground mt-1">
              다음 결제일: {periodEndLabel}
            </p>
          )}
          {/* 평생 할인은 이 업체 계정에 붙어 있을 때만 안내한다.
              정원이 찬 뒤 가입한 업체는 할인율이 0이라 이 문구가 아예 안 나온다. */}
          {hasLifetimeDiscount && (
            <p className="text-xs text-primary font-medium mt-1">
              {betaNumber ? `베타 ${betaNumber}번 · ` : ''}평생 {lifetimeDiscountRate}% 할인
              <span className="text-muted-foreground font-normal">
                {isBeta ? ' — 유료 플랜으로 바꾸셔도 계속 적용돼요' : ' — 지금 금액에 이미 적용돼 있어요'}
              </span>
            </p>
          )}
        </div>

        <Link href="/upgrade">
          <Button size="sm" variant={isBeta ? 'default' : 'outline'}>
            {isBeta ? '업그레이드' : '플랜 변경'}
          </Button>
        </Link>
      </div>

      {/* 예약된 플랜 변경 안내 */}
      {hasScheduledChange && nextPlanLabel && (
        <div className="flex items-center justify-between bg-blue-50 text-blue-700 rounded-md px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span>
              다음 결제부터 <strong>{nextPlanLabel} 플랜</strong>({formatPrice(PLANS[nextPlan as PlanId]?.price ?? 0)})으로 변경됩니다
            </span>
          </div>
          <CancelPlanChangeButton />
        </div>
      )}
    </div>
  )
}
