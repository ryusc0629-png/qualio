import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

interface SuccessPageProps {
  searchParams: Promise<{
    paymentId?: string
    code?: string
    message?: string
  }>
}

// 포트원(PortOne) 결제 완료 후 리다이렉트되는 페이지
export default async function PaymentSuccessPage({ searchParams }: SuccessPageProps) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { paymentId, code, message } = await searchParams

  if (!paymentId) {
    redirect('/upgrade')
  }

  let success = false
  let planId: PlanId | null = null
  let numericAmount = 0
  let errorMessage = ''

  // 모바일 리다이렉트에서 code가 붙으면 결제 실패/취소
  if (code) {
    errorMessage = message || '결제가 취소되었습니다'
  } else {
    try {
      // 서버→서버 fetch는 쿠키를 자동 전달하지 않으므로 세션 쿠키를 직접 넘겨 인증 유지
      const cookieHeader = (await cookies()).getAll()
        .map((c) => `${c.name}=${c.value}`)
        .join('; ')
      // 현재 요청 호스트로 자기 서버를 호출 (로컬/배포 모두 정상 동작)
      const reqHeaders = await headers()
      const host = reqHeaders.get('host')
      const protocol = reqHeaders.get('x-forwarded-proto') ?? 'http'
      const baseUrl = host
        ? `${protocol}://${host}`
        : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
      const response = await fetch(`${baseUrl}/api/payment/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ paymentId }),
      })

      const data = await response.json() as { success?: boolean; planId?: string; amount?: number; error?: string }

      if (response.ok && data.success) {
        success = true
        planId = (data.planId as PlanId) ?? null
        numericAmount = data.amount ?? 0
      } else {
        errorMessage = data.error ?? '결제 승인에 실패했습니다'
      }
    } catch {
      errorMessage = '결제 처리 중 오류가 발생했습니다'
    }
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
              <p>주문번호: <span className="font-mono text-xs">{paymentId}</span></p>
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
