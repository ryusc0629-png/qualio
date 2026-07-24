'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { Check, Star, Loader2, ArrowUp, ArrowDown, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PAID_PLANS, PLANS, formatPrice } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { schedulePlanChangeAction } from '@/lib/actions/subscription'
import { createBillingOrderAction } from '@/lib/actions/portone-billing'
import type { PaymentProvider } from '@/lib/payments/provider'
import { buildPaymentId } from '@/lib/payments/provider'
import { toast } from 'sonner'

interface UpgradeFormProps {
  businessId: string
  currentPlan: string
  businessName: string
  nextPlan?: string | null
  currentPeriodEnd?: string | null
  needsPayment?: boolean
  // 결제 PG (기본 포트원 / ?pg=toss 이면 토스). 페이지에서 결정해 내려준다.
  provider: PaymentProvider
}

// 플랜 순서 (업그레이드/다운그레이드 판별용)
const PLAN_ORDER: Record<string, number> = { beta: 0, starter: 1, pro: 2, scale: 3 }

// 정기결제(빌키) 사용 여부 — KCP의 정기결제 그룹 ID(batchPaymentGroupId) 개통 전까지는 false.
// false면 포트원 단건 결제로 진행(심사·즉시 이용). KCP 정기결제 개통 후 true로 바꾸면 자동청구 복귀.
const USE_BILLING_KEY = false

// 결제 위젯 클라이언트 컴포넌트
export function UpgradeForm({ businessId, currentPlan, businessName, nextPlan, currentPeriodEnd, needsPayment = false, provider }: UpgradeFormProps) {
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

  // 포트원 정기결제(빌키) — 카드 등록(빌키 발급) 후 서버가 첫 달을 청구하고 빌키를 저장한다.
  // 데스크톱은 팝업(프로미스), 모바일은 리다이렉트(redirectUrl 복귀).
  const startPortOneBilling = async (planId: PlanId) => {
    // 서버에서 짧은 주문번호(KCP 제약) 채번 + 고객정보 확보
    const orderResult = await createBillingOrderAction({ planId })
    const order = orderResult?.data
    if (!order) {
      toast.error(orderResult?.serverError ?? '결제 준비에 실패했어요. 다시 시도해주세요.')
      setIsPaying(false)
      return
    }

    // 결제 설정(스토어·채널 키)이 빌드에 안 박힌 경우 — 원인 불명 에러 대신 명확히 안내
    // (NEXT_PUBLIC_* 는 빌드 시점에 주입되므로, env 추가 후 '캐시 재배포'만 하면 비어있을 수 있음)
    const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID
    const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY
    if (!storeId || !channelKey) {
      console.error('[Payment] 포트원 결제 설정 누락:', { hasStoreId: !!storeId, hasChannelKey: !!channelKey })
      toast.error('결제 설정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
      setIsPaying(false)
      return
    }

    const PortOne = (await import('@portone/browser-sdk/v2')).default
    const response = await PortOne.requestIssueBillingKey({
      storeId,
      channelKey,
      billingKeyMethod: 'CARD',
      issueId: order.orderId, // KCP 필수 — 주문 고유번호
      issueName: order.issueName, // KCP 모바일 발급 필수
      displayAmount: order.displayAmount,
      currency: 'KRW',
      customer: order.customer,
      // 모바일 리다이렉트 복귀 지점 (orderId를 실어 보내 서버가 조회·청구)
      redirectUrl: `${window.location.origin}/api/payment/portone-billing-return?orderId=${encodeURIComponent(order.orderId)}`,
    })

    // 모바일이면 위에서 이미 리다이렉트됨. 아래는 데스크톱 팝업 흐름.
    if (!response || response.code != null) {
      toast.error(response?.message ?? '카드 등록이 취소되었어요')
      setIsPaying(false)
      return
    }

    // 발급된 빌키로 서버에서 첫 달 청구 + 구독 활성화
    const res = await fetch('/api/payment/portone-billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.orderId, billingKey: response.billingKey }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? '정기결제 등록에 실패했어요. 다시 시도해주세요.')
      setIsPaying(false)
      return
    }

    window.location.replace(
      `/upgrade/success?status=paid&ordr=${encodeURIComponent(order.orderId)}&amount=${order.displayAmount}&plan=${planId}`
    )
  }

  // 포트원 단건 결제 — KCP 정기결제(빌키) 개통 전까지 심사·운영에 사용.
  // 빌키발급은 KCP의 batchPaymentGroupId(정기결제 그룹 ID)가 있어야 동작하는데,
  // 아직 미개통이라 단건(1개월) 결제로 진행한다. 개통 후 USE_BILLING_KEY=true로 되돌리면 자동청구 복귀.
  // 데스크톱은 팝업(프로미스 반환) → /api/payment/confirm 검증, 모바일은 리다이렉트 → /api/payment/portone-return.
  const startPortOnePayment = async (planId: PlanId) => {
    const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID
    const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY
    if (!storeId || !channelKey) {
      console.error('[Payment] 포트원 결제 설정 누락:', { hasStoreId: !!storeId, hasChannelKey: !!channelKey })
      toast.error('결제 설정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
      setIsPaying(false)
      return
    }

    // 서버에서 짧은 주문번호(KCP 40자 제약) 채번 + 고객정보 확보 + 금액/플랜 저장(pending)
    const orderResult = await createBillingOrderAction({ planId })
    const order = orderResult?.data
    if (!order) {
      toast.error(orderResult?.serverError ?? '결제 준비에 실패했어요. 다시 시도해주세요.')
      setIsPaying(false)
      return
    }

    const plan = PLANS[planId]
    const PortOne = (await import('@portone/browser-sdk/v2')).default
    const response = await PortOne.requestPayment({
      storeId,
      channelKey,
      paymentId: order.orderId, // 짧은 주문번호(KCP ≤40자)
      orderName: `퀄리오 ${plan.label} 플랜 1개월`,
      totalAmount: order.displayAmount,
      currency: 'KRW',
      payMethod: 'CARD',
      customer: order.customer,
      // 모바일 리다이렉트 복귀 지점(orderId를 실어 보내 서버가 조회·검증·활성화)
      redirectUrl: `${window.location.origin}/api/payment/portone-return?orderId=${encodeURIComponent(order.orderId)}`,
    })

    // 모바일이면 위에서 이미 리다이렉트됨. 아래는 데스크톱 팝업 흐름.
    if (!response || response.code != null) {
      toast.error(response?.message ?? '결제가 취소되었어요')
      setIsPaying(false)
      return
    }

    // 서버에서 포트원 결제 내역 조회로 위변조 검증 + 구독 활성화
    const res = await fetch('/api/payment/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.orderId }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? '결제 확인에 실패했어요. 다시 시도해주세요.')
      setIsPaying(false)
      return
    }

    window.location.replace(
      `/upgrade/success?status=paid&ordr=${encodeURIComponent(order.orderId)}&amount=${order.displayAmount}&plan=${planId}`
    )
  }

  // 토스 결제창 — 리다이렉트 방식(성공 시 successUrl로 이동, 서버가 승인 처리)
  const startTossPayment = async (planId: PlanId) => {
    const clientKey = process.env.NEXT_PUBLIC_TOSSPAYMENTS_CLIENT_KEY
    if (!clientKey) {
      toast.error('결제 설정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
      setIsPaying(false)
      return
    }
    const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk')
    const plan = PLANS[planId]
    const orderId = buildPaymentId(businessId, planId)

    const tossPayments = await loadTossPayments(clientKey)
    const payment = tossPayments.payment({ customerKey: businessId })
    await payment.requestPayment({
      method: 'CARD',
      amount: { currency: 'KRW', value: plan.price },
      orderId,
      orderName: `퀄리오 ${plan.label} 플랜 1개월`,
      successUrl: `${window.location.origin}/api/payment/toss-return`,
      failUrl: `${window.location.origin}/upgrade/success?status=fail`,
      customerName: businessName,
    })
    // 리다이렉트 방식이라 성공/실패 모두 페이지 이동으로 처리됨 (여기로 돌아오지 않음)
  }

  const handlePayment = async () => {
    if (!selectedPlanId) {
      toast.error('플랜을 선택해주세요')
      return
    }
    setIsPaying(true)
    try {
      if (provider === 'toss') {
        await startTossPayment(selectedPlanId)
      } else if (USE_BILLING_KEY) {
        // KCP 정기결제(빌키) 개통 후 활성화 — 자동청구
        await startPortOneBilling(selectedPlanId)
      } else {
        // 개통 전: 단건 결제로 진행(심사 통과·즉시 이용)
        await startPortOnePayment(selectedPlanId)
      }
    } catch (e) {
      // 사용자가 결제창을 닫으면 SDK가 에러를 던짐 — 조용히 되돌린다
      console.error('[Payment] 결제 진행 오류:', e)
      // 실제 원인 메시지가 있으면 함께 보여줘 진단을 돕는다(설정/네트워크 오류 구분)
      const detail = e instanceof Error && e.message ? ` (${e.message})` : ''
      toast.error(`결제가 취소되었거나 문제가 생겼어요. 다시 시도해주세요.${detail}`)
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
              ? `${PAID_PLANS.find((p) => p.id === selectedPlanId)?.label} 플랜 구독 시작하기`
              : `${PAID_PLANS.find((p) => p.id === selectedPlanId)?.label} 플랜으로 변경 예약하기`
          ) : (
            '변경할 플랜을 선택해주세요'
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          {showPaymentFlow ? (
            <>
              {provider !== 'toss' && !USE_BILLING_KEY ? (
                <>선택한 플랜을 <strong>1개월</strong> 이용하는 결제예요. 만료 전 다시 결제하시면 이어서 이용할 수 있어요.<br /></>
              ) : (
                <>등록한 카드로 <strong>매월 자동 결제</strong>되는 정기 구독이에요. 언제든지 해지할 수 있어요.<br /></>
              )}
              {provider === 'toss' ? '토스페이먼츠' : '포트원(PortOne)'}을 통해 카드로 안전하게 결제되며,
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
