import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register'
import { SessionRefresher } from '@/components/pwa/session-refresher'

// 대시보드 레이아웃 — 서버 컴포넌트에서 인증 검증 후 업체명 전달
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 인증 확인: 일반 클라이언트 사용
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 업체 정보 조회: 서비스 롤 사용 (RLS 우회, 서버 전용)
  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id, businesses!business_id(name)')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')

  // 관리자 이메일은 결제 없이 대시보드 접근 가능 (테스트/운영용)
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  const isAdmin = adminEmails.includes(user.email ?? '')

  if (!isAdmin) {
    // 구독 플랜 확인 — 베타 또는 만료된 취소 구독이면 결제 페이지로 이동
    const { data: subscription } = await db
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('business_id', profile.business_id)
      .maybeSingle()

    if (!subscription || subscription.plan === 'beta') redirect('/upgrade')

    // 취소된 구독 + 결제 기간 만료 시 접근 차단
    if (
      subscription.status === 'cancelled' &&
      subscription.current_period_end &&
      new Date(subscription.current_period_end) < new Date()
    ) {
      redirect('/upgrade')
    }
  }

  const businessName =
    (profile.businesses as { name: string } | null)?.name ?? '내 업체'

  return (
    <DashboardShell businessName={businessName}>
      <ServiceWorkerRegister />
      <SessionRefresher />
      {children}
    </DashboardShell>
  )
}
