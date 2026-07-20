import { CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

interface SuccessPageProps {
  searchParams: Promise<{
    status?: string
    ordr?: string
    amount?: string
    plan?: string
    message?: string
  }>
}

// KCP 결제 완료 후 리턴 핸들러(/api/payment/kcp-return)가 리다이렉트하는 페이지
// 승인·구독 활성화는 리턴 핸들러에서 끝났고, 여기선 결과만 표시한다.
export default async function PaymentSuccessPage({ searchParams }: SuccessPageProps) {
  const { status, ordr, amount, plan, message } = await searchParams

  const success = status === 'paid'
  const planLabel = plan ? PLANS[plan as PlanId]?.label : null
  const numericAmount = amount ? Number(amount) : 0

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        {success ? (
          <>
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">결제가 완료되었습니다!</h1>
              {planLabel && (
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{planLabel} 플랜</span>이 활성화되었습니다.
                </p>
              )}
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground text-left space-y-1">
              {ordr && <p>주문번호: <span className="font-mono text-xs">{ordr}</span></p>}
              <p>결제 금액: {numericAmount.toLocaleString('ko-KR')}원</p>
            </div>
            <Link href="/dashboard">
              <Button className="w-full" size="lg">대시보드로 이동하기</Button>
            </Link>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">결제가 완료되지 않았어요</h1>
              <p className="text-muted-foreground">{message || '결제가 취소되었거나 승인에 실패했습니다'}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Link href="/upgrade">
                <Button className="w-full">다시 시도하기</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
