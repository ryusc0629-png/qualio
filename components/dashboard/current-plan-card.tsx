import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PLANS, formatPrice } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { CalendarClock } from 'lucide-react'
import { CancelPlanChangeButton } from './cancel-plan-change-button'

interface CurrentPlanCardProps {
  planId: PlanId
  currentPeriodEnd: string | null
  status: string
  nextPlan?: string | null
}

// 현재 구독 플랜 표시 카드 (설정 페이지용)
export function CurrentPlanCard({ planId, currentPeriodEnd, status, nextPlan }: CurrentPlanCardProps) {
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
          <p className="text-sm text-muted-foreground mt-0.5">
            {isBeta ? '무료 베타 기간' : formatPrice(plan.price)}
          </p>
          {isPaid && periodEndLabel && (
            <p className="text-xs text-muted-foreground mt-1">
              다음 결제일: {periodEndLabel}
            </p>
          )}
          {isBeta && (
            <p className="text-xs text-muted-foreground mt-1">
              베타 기간 종료 전 유료 플랜으로 전환 시 30% 할인 혜택
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
