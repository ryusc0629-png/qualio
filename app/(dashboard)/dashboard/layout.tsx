import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'

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

  // 구독 플랜 확인 — 무료(beta) 플랜이면 결제 페이지로 이동
  const { data: subscription } = await db
    .from('subscriptions')
    .select('plan')
    .eq('business_id', profile.business_id)
    .maybeSingle()

  if (!subscription || subscription.plan === 'beta') redirect('/upgrade')

  const businessName =
    (profile.businesses as { name: string } | null)?.name ?? '내 업체'

  return (
    <div className="min-h-screen flex">
      <Sidebar businessName={businessName} />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
