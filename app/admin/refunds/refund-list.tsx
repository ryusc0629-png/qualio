'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { refundPaymentAction } from '@/lib/actions/admin-refund'
import { quoteRefund } from '@/lib/payments/refund-calc'
import type { RefundablePayment } from '@/lib/admin/refunds'

interface Props {
  payments: RefundablePayment[]
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' }) : '-'

export function RefundList({ payments }: Props) {
  const [target, setTarget] = useState<RefundablePayment | null>(null)

  if (payments.length === 0) {
    return (
      <div className="text-center py-12 space-y-3 border rounded-xl bg-muted/20">
        <p className="text-muted-foreground">아직 결제된 건이 없어요</p>
        <p className="text-xs text-muted-foreground">결제가 들어오면 여기에 쌓이고, 환불 요청이 오면 처리할 수 있어요.</p>
      </div>
    )
  }

  return (
    <>
      <ul className="space-y-2">
        {payments.map((p) => (
          <li key={p.ordrIdxx} className="border rounded-xl p-4 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm">{p.businessName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.planLabel} 플랜 · {won(p.amount)} · {day(p.paidAt)} 결제
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  결제 후 활동{' '}
                  <b className={p.usageCount > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                    {p.usageCount}건
                  </b>
                  {p.usageCount === 0 && ' (미사용 → 7일 이내면 전액 환불 대상)'}
                </p>
              </div>
              <Button variant="outline" className="h-12" onClick={() => setTarget(p)}>
                환불 처리하기
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {target && <RefundDialog payment={target} onClose={() => setTarget(null)} />}
    </>
  )
}

function RefundDialog({ payment, onClose }: { payment: RefundablePayment; onClose: () => void }) {
  // 담당자가 '이용 내역 확인'을 눌러 판단한다 — 약관 제6조의 처리 절차 2단계.
  const [hasUsage, setHasUsage] = useState(payment.usageCount > 0)
  const [companyFault, setCompanyFault] = useState(false)
  const [reason, setReason] = useState('')

  const quote =
    payment.periodStart && payment.periodEnd
      ? quoteRefund({
          paidAmount: payment.amount,
          periodStart: payment.periodStart,
          periodEnd: payment.periodEnd,
          hasUsage,
          companyFault,
        })
      : null

  const { execute, isPending } = useAction(refundPaymentAction, {
    onSuccess: ({ data }) => {
      toast.success(`${won(data?.refunded ?? 0)} 환불했어요!`)
      onClose()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '환불하지 못했어요. 다시 눌러주세요'),
  })

  const handleRefund = () => {
    if (!quote || quote.amount <= 0) {
      toast.error('환불할 금액이 없어요')
      return
    }
    if (!reason.trim()) {
      toast.error('환불 사유를 적어주세요')
      return
    }
    execute({
      ordrIdxx: payment.ordrIdxx,
      amount: quote.amount,
      reason: reason.trim(),
      cancelSubscription: true,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <ScrollLock />
      <div
        ref={(el) => el?.focus()}
        tabIndex={-1}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain outline-none p-6 space-y-5"
      >
        <div>
          <h2 className="text-lg font-bold">{payment.businessName} 환불</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {payment.planLabel} 플랜 {won(payment.amount)} · {day(payment.paidAt)} 결제
          </p>
        </div>

        {/* 1단계 — 이용 내역 확인 */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">1. 이용 내역을 확인하세요</p>
          <p className="text-xs text-muted-foreground">
            결제 후 활동 <b>{payment.usageCount}건</b>이 기록돼 있어요. 실제로 쓰셨는지 확인하고 골라주세요.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHasUsage(false)}
              className={`flex-1 h-12 rounded-lg border text-sm ${!hasUsage ? 'border-primary bg-primary/5 font-semibold' : ''}`}
            >
              이용 안 했어요
            </button>
            <button
              type="button"
              onClick={() => setHasUsage(true)}
              className={`flex-1 h-12 rounded-lg border text-sm ${hasUsage ? 'border-primary bg-primary/5 font-semibold' : ''}`}
            >
              이용했어요
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm pt-1">
            <input type="checkbox" checked={companyFault} onChange={(e) => setCompanyFault(e.target.checked)} />
            서비스 장애·중복 결제 등 <b>우리 잘못</b>이에요 (이용 내역과 무관하게 전액)
          </label>
        </div>

        {/* 2단계 — 금액은 자동 산정 */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-sm font-semibold mb-1">2. 환불 금액</p>
          {quote ? (
            <>
              <p className="text-2xl font-extrabold text-primary">{won(quote.amount)}</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{quote.reason}</p>
              <p className="text-xs text-muted-foreground mt-1">
                전체 {quote.totalDays}일 · 쓴 날 {quote.usedDays}일 · 남은 날 {quote.remainingDays}일
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">이용 기간 정보가 없어 금액을 계산할 수 없어요.</p>
          )}
        </div>

        {/* 3단계 — 사유 */}
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">3. 환불 사유 (필수)</p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 7일 이내 미사용 청약철회 요청"
            className="w-full h-12 px-3 rounded-lg border text-sm"
          />
          <p className="text-xs text-muted-foreground">포트원 기록에 남고, 나중에 왜 환불했는지 찾는 근거가 돼요.</p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-900 leading-relaxed">
            누르면 <b>실제로 카드에 환불이 나갑니다.</b> 되돌릴 수 없어요. 고객 카드사 기준 영업일 3~5일 걸려요.
            환불과 함께 구독도 해지됩니다.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-12" onClick={onClose} disabled={isPending}>
            닫기
          </Button>
          <Button className="flex-1 h-12" onClick={handleRefund} disabled={isPending || !quote || quote.amount <= 0}>
            {isPending ? '환불 중...' : `${quote ? won(quote.amount) : ''} 환불하기`}
          </Button>
        </div>
      </div>
    </div>
  )
}
