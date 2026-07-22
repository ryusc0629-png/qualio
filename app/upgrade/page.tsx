import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UpgradeForm } from '@/components/dashboard/upgrade-form'
import { LogoutButton } from '@/components/dashboard/logout-button'
import { Button } from '@/components/ui/button'
import { resolvePaymentProvider } from '@/lib/payments/provider'
import Link from 'next/link'

// 플랜 결제 페이지 — 대시보드 밖에 위치해야 페이월 무한루프 방지
// ?pg=toss 이면 토스 결제창, 그 외엔 기본 PG(포트원) — 두 심사를 동시에 통과시키기 위함
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ pg?: string }>
}) {
  const { pg } = await searchParams
  const provider = resolvePaymentProvider(pg)

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()

  const { data: profile } = await db
    .from('profiles')
    .select('business_id, businesses!business_id(name)')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')

  const businessName = (profile.businesses as { name: string } | null)?.name ?? '내 업체'

  const { data: subscription } = await db
    .from('subscriptions')
    .select('plan, status, current_period_end, next_plan' as never)
    .eq('business_id', profile.business_id)
    .maybeSingle() as { data: { plan: string; status: string; current_period_end: string | null; next_plan: string | null } | null }

  const currentPlan = subscription?.plan ?? 'beta'
  const isBeta = currentPlan === 'beta'

  // 만료 여부 판별: 취소+기간만료 또는 구독 없음
  const isExpired = !subscription
    || (subscription.status === 'cancelled'
      && !!subscription.current_period_end
      && new Date(subscription.current_period_end) < new Date())
  // 결제가 필요한 상태: 베타이거나 만료된 유료 사용자
  const needsPayment = isBeta || isExpired

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 헤더 */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">퀄리오</Link>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">{businessName}</p>
            {!needsPayment && (
              <Link href="/dashboard/settings">
                <Button variant="ghost" size="sm">설정으로 돌아가기</Button>
              </Link>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-12 w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">
            {needsPayment ? '플랜을 선택해주세요' : '플랜 변경'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {needsPayment
              ? isExpired && !isBeta
                ? '이용 기간이 만료됐습니다. 플랜을 선택하고 결제하면 바로 이어서 사용할 수 있어요.'
                : '업체 규모에 맞는 플랜을 선택하고 결제하면 바로 시작할 수 있습니다.'
              : '현재 사용 중인 플랜을 변경할 수 있습니다. 새 플랜은 다음 결제부터 적용됩니다.'}
          </p>
        </div>

        <UpgradeForm
          businessId={profile.business_id}
          currentPlan={currentPlan}
          businessName={businessName}
          nextPlan={subscription?.next_plan ?? null}
          currentPeriodEnd={subscription?.current_period_end ?? null}
          needsPayment={needsPayment}
          provider={provider}
        />
      </main>
    </div>
  )
}
