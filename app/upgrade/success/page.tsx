import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

interface SuccessPageProps {
  searchParams: Promise<{
    paymentKey?: string
    orderId?: string
    amount?: string
  }>
}

// 토스페이먼츠 결제 완료 후 리다이렉트되는 페이지
export default async function PaymentSuccessPage({ searchParams }: SuccessPageProps) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { paymentKey, orderId, amount } = await searchParams

  if (!paymentKey || !orderId || !amount) {
    redirect('/upgrade')
  }

  const numericAmount = parseInt(amount, 10)

  let success = false
  let planId: PlanId | null = null
  let errorMessage = ''

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/payment/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: numericAmount }),
    })

    const data = await response.json() as { success?: boolean; planId?: string; error?: string }

    if (response.ok && data.success) {
      success = true
      planId = (data.planId as PlanId) ?? null
    } else {
      errorMessage = data.error ?? '결제 승인에 실패했습니다'
    }
  } catch {
    errorMessage = '결제 처리 중 오류가 발생했습니다'
  }

  const planLabel = planId ? PLANS[planId]?.label : null

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
              <p>주문번호: <span className="font-mono text-xs">{orderId}</span></p>
              <p>결제 금액: {numericAmount.toLocaleString('ko-KR')}원</p>
            </div>
            <Link href="/dashboard">
              <Button className="w-full" size="lg">대시보드 시작하기</Button>
            </Link>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">결제 승인 실패</h1>
              <p className="text-muted-foreground">{errorMessage}</p>
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
