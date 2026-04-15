import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UpgradeForm } from '@/components/dashboard/upgrade-form'
import Link from 'next/link'

// 플랜 결제 페이지 — 대시보드 밖에 위치해야 페이월 무한루프 방지
export default async function UpgradePage() {
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

  // 이미 유료 플랜이면 대시보드로
  const { data: subscription } = await db
    .from('subscriptions')
    .select('plan')
    .eq('business_id', profile.business_id)
    .maybeSingle()

  const currentPlan = subscription?.plan ?? 'beta'
  if (currentPlan !== 'beta') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 헤더 */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">퀄리오</Link>
          <p className="text-sm text-muted-foreground">{businessName}</p>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-12 w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">플랜을 선택해주세요</h1>
          <p className="text-muted-foreground mt-1">
            업체 규모에 맞는 플랜을 선택하고 결제하면 바로 시작할 수 있습니다.
          </p>
        </div>

        <UpgradeForm
          businessId={profile.business_id}
          currentPlan={currentPlan}
          businessName={businessName}
        />
      </main>
    </div>
  )
}
