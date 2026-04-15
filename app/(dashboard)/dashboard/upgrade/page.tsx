import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UpgradeForm } from '@/components/dashboard/upgrade-form'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// 플랜 업그레이드 페이지 — 플랜 선택 + 토스페이먼츠 결제
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

  // 현재 구독 플랜 조회
  const { data: subscription } = await db
    .from('subscriptions')
    .select('plan')
    .eq('business_id', profile.business_id)
    .maybeSingle()

  const currentPlan = subscription?.plan ?? 'beta'

  return (
    <div className="max-w-4xl space-y-6">
      {/* 뒤로가기 */}
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        설정으로 돌아가기
      </Link>

      <div>
        <h1 className="text-2xl font-bold">플랜 업그레이드</h1>
        <p className="text-muted-foreground mt-1">
          업체 규모에 맞는 플랜을 선택하고 결제해주세요.
        </p>
      </div>

      <UpgradeForm
        businessId={profile.business_id}
        currentPlan={currentPlan}
        businessName={businessName}
      />
    </div>
  )
}
