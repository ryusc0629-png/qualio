'use client'

import { useState } from 'react'
import { loadTossPayments, ANONYMOUS } from '@tosspayments/tosspayments-sdk'
import { Check, Star, Loader2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PAID_PLANS, PLANS, formatPrice } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { toast } from 'sonner'

interface UpgradeFormProps {
  businessId: string
  currentPlan: string
  businessName: string
}

// 플랜 순서 (업그레이드/다운그레이드 판별용)
const PLAN_ORDER: Record<string, number> = { beta: 0, starter: 1, pro: 2, scale: 3 }

// 결제 위젯 클라이언트 컴포넌트
export function UpgradeForm({ businessId, currentPlan, businessName }: UpgradeFormProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId | null>(null)
  const [isPaying, setIsPaying] = useState(false)

  const isBeta = currentPlan === 'beta'
  const currentPlanLabel = PLANS[currentPlan as PlanId]?.label ?? '베타'

  // 선택한 플랜이 업그레이드인지 다운그레이드인지
  const getChangeDirection = (targetPlan: string) => {
    const current = PLAN_ORDER[currentPlan] ?? 0
    const target = PLAN_ORDER[targetPlan] ?? 0
    if (target > current) return 'upgrade'
    if (target < current) return 'downgrade'
    return 'same'
  }

  const selectedDirection = selectedPlanId ? getChangeDirection(selectedPlanId) : null

  const handlePayment = async () => {
    if (!selectedPlanId) {
      toast.error('플랜을 선택해주세요')
      return
    }

    const plan = PAID_PLANS.find((p) => p.id === selectedPlanId)
    if (!plan) return

    const clientKey = process.env.NEXT_PUBLIC_TOSSPAYMENTS_CLIENT_KEY
    if (!clientKey) {
      toast.error('결제 설정 오류입니다. 관리자에게 문의해주세요.')
      return
    }

    setIsPaying(true)
    try {
      const tossPayments = await loadTossPayments(clientKey)
      const payment = tossPayments.payment({ customerKey: ANONYMOUS })

      // orderId: {businessId}_{planId}_{timestamp}
      const orderId = `${businessId}_${selectedPlanId}_${Date.now()}`

      const orderName = isBeta
        ? `퀄리오 ${plan.label} 플랜 1개월`
        : `퀄리오 ${currentPlanLabel} → ${plan.label} 플랜 변경`

      await payment.requestPayment({
        method: 'CARD',
        amount: {
          currency: 'KRW',
          value: plan.price,
        },
        orderId,
        orderName,
        successUrl: `${window.location.origin}/upgrade/success`,
        failUrl: `${window.location.origin}/upgrade`,
        customerName: businessName,
      })
    } catch (e) {
      // 사용자가 결제 창을 닫은 경우 등 — 조용히 처리
      const err = e as { code?: string }
      if (err?.code !== 'USER_CANCEL') {
        toast.error('결제 진행 중 오류가 발생했습니다')
      }
      setIsPaying(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 현재 플랜 안내 (유료 사용자만) */}
      {!isBeta && (
        <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">현재 플랜</p>
            <p className="font-semibold text-lg">{currentPlanLabel} 플랜</p>
          </div>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
            사용 중
          </span>
        </div>
      )}

      {/* 플랜 선택 */}
      <div className="grid md:grid-cols-3 gap-4">
        {PAID_PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlan
          const isSelected = plan.id === selectedPlanId
          const direction = getChangeDirection(plan.id)

          return (
            <button
              key={plan.id}
              type="button"
              disabled={isCurrentPlan}
              onClick={() => setSelectedPlanId(plan.id as PlanId)}
              className={`relative text-left rounded-xl border p-5 transition-all focus:outline-none ${
                isCurrentPlan
                  ? 'border-primary/30 bg-primary/5 cursor-not-allowed'
                  : isSelected
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                    : 'border-border hover:border-primary/50 bg-card'
              }`}
            >
              {/* 추천 배지 */}
              {plan.highlight && !isCurrentPlan && (
                <div className="absolute -top-2.5 left-4">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current" />
                    주력
                  </span>
                </div>
              )}

              {/* 현재 플랜 배지 */}
              {isCurrentPlan && (
                <div className="absolute -top-2.5 left-4">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-0.5 rounded-full">
                    현재 플랜
                  </span>
                </div>
              )}

              {/* 업그레이드/다운그레이드 배지 (유료 사용자, 현재 플랜 아닌 경우) */}
              {!isBeta && !isCurrentPlan && (
                <div className="absolute -top-2.5 right-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                    direction === 'upgrade'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {direction === 'upgrade'
                      ? <><ArrowUp className="h-3 w-3" />업그레이드</>
                      : <><ArrowDown className="h-3 w-3" />다운그레이드</>}
                  </span>
                </div>
              )}

              <div className="mb-3">
                <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                <h3 className="font-bold text-lg">{plan.label}</h3>
                <p className="text-xl font-bold text-primary mt-1">{formatPrice(plan.price)}</p>
              </div>

              <p className="text-xs text-muted-foreground mb-3">{plan.target}</p>

              <ul className="space-y-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* 선택 체크 */}
              {isSelected && (
                <div className="absolute top-3 right-3 h-5 w-5 bg-primary rounded-full flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* 결제하기 버튼 */}
      <div className="flex flex-col items-center gap-3">
        <Button
          size="lg"
          className="w-full max-w-sm"
          disabled={!selectedPlanId || isPaying}
          onClick={handlePayment}
        >
          {isPaying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              결제 페이지 이동 중...
            </>
          ) : selectedPlanId ? (
            isBeta
              ? `${PAID_PLANS.find((p) => p.id === selectedPlanId)?.label} 플랜 결제하기`
              : selectedDirection === 'upgrade'
                ? `${PAID_PLANS.find((p) => p.id === selectedPlanId)?.label} 플랜으로 업그레이드`
                : `${PAID_PLANS.find((p) => p.id === selectedPlanId)?.label} 플랜으로 변경하기`
          ) : (
            '플랜을 선택해주세요'
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          {!isBeta && selectedDirection === 'downgrade' ? (
            <>
              다운그레이드 시 새 플랜 금액으로 <strong>1개월(30일)</strong> 이용권이 제공됩니다.<br />
              기존 결제 건의 환불은 별도로 요청해주세요.
            </>
          ) : (
            <>
              결제 1건당 <strong>1개월(30일)</strong> 이용권이 제공됩니다. 자동 갱신 없음.<br />
              토스페이먼츠를 통해 안전하게 처리됩니다.
              결제 후 7일 이내 미사용 시 전액 환불 가능합니다.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
