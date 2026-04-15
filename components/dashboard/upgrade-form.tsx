'use client'

import { useState } from 'react'
import { loadTossPayments, ANONYMOUS } from '@tosspayments/tosspayments-sdk'
import { Check, Star, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PAID_PLANS, formatPrice } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { toast } from 'sonner'

interface UpgradeFormProps {
  businessId: string
  currentPlan: string
  businessName: string
}

// 결제 위젯 클라이언트 컴포넌트
export function UpgradeForm({ businessId, currentPlan, businessName }: UpgradeFormProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId | null>(null)
  const [isPaying, setIsPaying] = useState(false)

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

      await payment.requestPayment({
        method: 'CARD',
        amount: {
          currency: 'KRW',
          value: plan.price,
        },
        orderId,
        orderName: `퀄리오 ${plan.label} 플랜 1개월`,
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
      {/* 플랜 선택 */}
      <div className="grid md:grid-cols-3 gap-4">
        {PAID_PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlan
          const isSelected = plan.id === selectedPlanId

          return (
            <button
              key={plan.id}
              type="button"
              disabled={isCurrentPlan}
              onClick={() => setSelectedPlanId(plan.id as PlanId)}
              className={`relative text-left rounded-xl border p-5 transition-all focus:outline-none ${
                isCurrentPlan
                  ? 'opacity-50 cursor-not-allowed bg-muted'
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
                  <span className="bg-muted-foreground text-background text-xs font-semibold px-2.5 py-0.5 rounded-full">
                    현재 플랜
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
            `${PAID_PLANS.find((p) => p.id === selectedPlanId)?.label} 플랜 결제하기`
          ) : (
            '플랜을 선택해주세요'
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          토스페이먼츠를 통해 안전하게 처리됩니다.
          결제 후 7일 이내 미사용 시 전액 환불 가능합니다.
        </p>
      </div>
    </div>
  )
}
