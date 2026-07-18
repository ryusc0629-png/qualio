'use client'

import { useState } from 'react'
import * as PortOne from '@portone/browser-sdk/v2'
import { useAction } from 'next-safe-action/hooks'
import { Check, Star, Loader2, ArrowUp, ArrowDown, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PAID_PLANS, PLANS, formatPrice } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { schedulePlanChangeAction } from '@/lib/actions/subscription'
import { toast } from 'sonner'

interface UpgradeFormProps {
  businessId: string
  currentPlan: string
  businessName: string
  nextPlan?: string | null
  currentPeriodEnd?: string | null
  needsPayment?: boolean
}

// 플랜 순서 (업그레이드/다운그레이드 판별용)
const PLAN_ORDER: Record<string, number> = { beta: 0, starter: 1, pro: 2, scale: 3 }

// 결제 위젯 클라이언트 컴포넌트
export function UpgradeForm({ businessId, currentPlan, businessName, nextPlan, currentPeriodEnd, needsPayment = false }: UpgradeFormProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId | null>(
    nextPlan ? (nextPlan as PlanId) : null
  )
  const [isPaying, setIsPaying] = useState(false)

  const isBeta = currentPlan === 'beta'
  // 결제가 필요한 상태: 베타이거나 만료된 유료 사용자
  const showPaymentFlow = needsPayment
  const currentPlanLabel = PLANS[currentPlan as PlanId]?.label ?? '베타'

  // 만료일 포맷
  const periodEndLabel = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Seoul',
      })
    : null

  // 선택한 플랜이 업그레이드인지 다운그레이드인지
  const getChangeDirection = (targetPlan: string) => {
    const current = PLAN_ORDER[currentPlan] ?? 0
    const target = PLAN_ORDER[targetPlan] ?? 0
    if (target > current) return 'upgrade'
    if (target < current) return 'downgrade'
    return 'same'
  }

  // 유료 사용자: 플랜 변경 예약 액션
  const { execute: schedulePlanChange, isPending: isScheduling } = useAction(schedulePlanChangeAction, {
    onSuccess: ({ data }) => {
      if (data?.cancelled) {
        toast.success('플랜 변경 예약이 취소됐어요')
      } else if (data?.scheduled) {
        toast.success(`${data.planLabel} 플랜으로 변경이 예약됐어요`)
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '플랜 변경에 실패했어요')
    },
  })

  // 베타 사용자: 포트원(PortOne) V2 결제 플로우
  const handlePayment = async () => {
    if (!selectedPlanId) {
      toast.error('플랜을 선택해주세요')
      return
    }

    const plan = PAID_PLANS.find((p) => p.id === selectedPlanId)
    if (!plan) return

    const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID
    const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY
    if (!storeId || !channelKey) {
      toast.error('결제 설정 오류입니다. 관리자에게 문의해주세요.')
      return
    }

    setIsPaying(true)
    try {
      // paymentId 형식은 서버(confirm)에서 businessId/planId 파싱에 사용됨
      const paymentId = `${businessId}_${selectedPlanId}_${Date.now()}`

      const response = await PortOne.requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName: `퀄리오 ${plan.label} 플랜 1개월`,
        totalAmount: plan.price,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        customer: { fullName: businessName },
        // 모바일은 이 URL로 리다이렉트되며 paymentId·code가 쿼리로 붙는다
        redirectUrl: `${window.location.origin}/upgrade/success`,
      })

      // 모바일 리다이렉트 시엔 여기 도달하지 않음(위 redirectUrl로 이동)
      // PC(팝업/iframe)는 결과가 반환됨
      if (!response) return

      // code가 있으면 실패/취소
      if (response.code != null) {
        toast.error(response.message ?? '결제가 취소되었어요')
        setIsPaying(false)
        return
      }

      // 성공 — 서버 검증 페이지로 이동(구독 활성화)
      window.location.replace(`/upgrade/success?paymentId=${encodeURIComponent(response.paymentId)}`)
    } catch {
      toast.error('결제 진행 중 오류가 발생했습니다')
      setIsPaying(false)
    }
  }

  // 유료 사용자: 플랜 변경 예약
  const handleScheduleChange = () => {
    if (!selectedPlanId) {
      toast.error('변경할 플랜을 선택해주세요')
      return
    }
    schedulePlanChange({ nextPlan: selectedPlanId })
  }

  const handleAction = showPaymentFlow ? handlePayment : handleScheduleChange
  const isProcessing = isPaying || isScheduling

  return (
    <div className="space-y-6">
      {/* 현재 플랜 안내 (유료 사용자만) */}
      {!isBeta && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">현재 플랜</p>
              <p className="font-semibold text-lg">{currentPlanLabel} 플랜</p>
            </div>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
              사용 중
            </span>
          </div>
          {periodEndLabel && (
            <p className="text-xs text-muted-foreground">
              현재 이용 기간: <strong>{periodEndLabel}</strong>까지
            </p>
          )}
          {/* 이미 예약된 변경이 있을 때 */}
          {nextPlan && nextPlan !== currentPlan && (
            <div className="flex items-center gap-2 bg-blue-50 text-blue-700 rounded-md px-3 py-2 text-sm">
              <CalendarClock className="h-4 w-4 shrink-0" />
              <span>
                다음 결제부터 <strong>{PLANS[nextPlan as PlanId]?.label}</strong> 플랜으로 변경 예정
              </span>
            </div>
          )}
        </div>
      )}

      {/* 플랜 선택 */}
      <div className="grid md:grid-cols-3 gap-4">
        {PAID_PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlan
          const isSelected = plan.id === selectedPlanId
          const direction = getChangeDirection(plan.id)
          const isScheduledPlan = plan.id === nextPlan

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
                    : isScheduledPlan
                      ? 'border-blue-300 bg-blue-50/50'
                      : 'border-border hover:border-primary/50 bg-card'
              }`}
            >
              {/* 추천 배지 */}
              {plan.highlight && !isCurrentPlan && !isScheduledPlan && (
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

              {/* 예약됨 배지 */}
              {isScheduledPlan && !isCurrentPlan && (
                <div className="absolute -top-2.5 left-4">
                  <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    변경 예정
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

      {/* 액션 버튼 */}
      <div className="flex flex-col items-center gap-3">
        <Button
          size="lg"
          className="w-full max-w-sm"
          disabled={!selectedPlanId || isProcessing}
          onClick={handleAction}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {showPaymentFlow ? '결제 페이지 이동 중...' : '변경 중...'}
            </>
          ) : selectedPlanId ? (
            showPaymentFlow
              ? `${PAID_PLANS.find((p) => p.id === selectedPlanId)?.label} 플랜 결제하기`
              : `${PAID_PLANS.find((p) => p.id === selectedPlanId)?.label} 플랜으로 변경 예약하기`
          ) : (
            '변경할 플랜을 선택해주세요'
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          {showPaymentFlow ? (
            <>
              결제 1건당 <strong>1개월(30일)</strong> 이용권이 제공됩니다. 자동 갱신 없음.<br />
              포트원(PortOne)을 통해 안전하게 결제됩니다.
              결제 후 7일 이내 미사용 시 전액 환불 가능합니다.
            </>
          ) : (
            <>
              현재 이용 기간이 끝난 후 다음 결제부터 선택한 플랜이 적용됩니다.<br />
              기존 결제에 대한 환불이나 추가 비용은 없습니다.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
