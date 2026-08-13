import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface SuccessPageProps {
  searchParams: Promise<{
    status?: string
    ordr?: string
    amount?: string
    plan?: string
    message?: string
  }>
}

// 결제 완료 후 리턴 핸들러(/api/payment/*-return)가 리다이렉트하는 페이지.
// 승인·구독 활성화는 리턴 핸들러에서 끝나고, 여기선 결과만 보여준다.
//
// ⚠️ 주소창 값(?status=paid&amount=...)은 누구나 손으로 바꿔 넣을 수 있다.
// 그래서 '완료' 여부는 반드시 DB의 실제 구독 상태로 판단하고, 주소창 값은 참고용으로만 쓴다.
export default async function PaymentSuccessPage({ searchParams }: SuccessPageProps) {
  const { status, ordr, message } = await searchParams

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) redirect('/onboarding')

  const { data: subscription } = (await db
    .from('subscriptions')
    .select('plan, status, current_period_end')
    .eq('business_id', profile.business_id)
    .maybeSingle()) as {
      data: { plan: string; status: string; current_period_end: string | null } | null
    }

  // 실제로 유료 플랜이 활성화됐는지 (주소창이 아니라 이 값이 기준)
  const activePlan = subscription?.plan as PlanId | undefined
  const isActivated = Boolean(
    subscription &&
    subscription.status === 'active' &&
    activePlan &&
    (PLANS[activePlan]?.price ?? 0) > 0,
  )
  const planLabel = activePlan ? PLANS[activePlan]?.label : null

  // 주소창은 성공이라는데 DB에는 아직 반영이 안 된 경우 — 실패로 단정하지 않고 '처리 중'으로 안내한다
  // (승인은 됐는데 활성화 처리가 늦거나 실패했을 수 있어, 사장님이 이중 결제하지 않도록 막는다)
  const claimsPaid = status === 'paid'
  const isPending = claimsPaid && !isActivated

  const periodEndLabel = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Seoul',
      })
    : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        {isActivated ? (
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
              {periodEndLabel && <p>이용 기간: {periodEndLabel}까지</p>}
            </div>
            <Link href="/dashboard">
              <Button className="w-full" size="lg">대시보드로 이동하기</Button>
            </Link>
          </>
        ) : isPending ? (
          <>
            <div className="flex justify-center">
              <Clock className="h-16 w-16 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">결제 확인 중이에요</h1>
              <p className="text-muted-foreground">
                결제는 접수됐는데 플랜 적용이 아직 안 끝났어요. 잠시 후 새로고침해 주세요.
                <br />몇 분이 지나도 그대로면 다시 결제하지 마시고 알려주세요.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground text-left space-y-1">
              {ordr && <p>주문번호: <span className="font-mono text-xs">{ordr}</span></p>}
            </div>
            <Link href="/dashboard">
              <Button className="w-full" variant="outline">대시보드로 이동하기</Button>
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
