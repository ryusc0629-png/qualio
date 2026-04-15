import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from './settings-form'
import { CurrentPlanCard } from '@/components/dashboard/current-plan-card'
import type { PlanId } from '@/lib/config/plans'

export default async function SettingsPage() {
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

  const [businessResult, subscriptionResult] = await Promise.all([
    db
      .from('businesses')
      .select('name, phone, address, description, naver_place_url')
      .eq('id', profile.business_id)
      .maybeSingle(),
    db
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('business_id', profile.business_id)
      .maybeSingle(),
  ])

  if (!businessResult.data) redirect('/onboarding')

  const subscription = subscriptionResult.data ?? {
    plan: 'beta',
    status: 'active',
    current_period_end: null,
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">설정</h1>
        <p className="text-sm text-muted-foreground mt-1">업체 정보 및 채널 연동을 관리합니다</p>
      </div>

      {/* 구독 플랜 현황 */}
      <CurrentPlanCard
        planId={(subscription.plan as PlanId) ?? 'beta'}
        status={subscription.status ?? 'active'}
        currentPeriodEnd={subscription.current_period_end ?? null}
      />

      {/* 업체 정보 */}
      <SettingsForm business={businessResult.data} />
    </div>
  )
}
