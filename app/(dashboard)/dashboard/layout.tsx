import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'

// 대시보드 레이아웃 — 서버 컴포넌트에서 인증 검증 후 업체명 전달
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 업체 정보 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_id, businesses(name)')
    .eq('id', user.id)
    .single()

  if (!profile?.business_id) redirect('/onboarding')

  const businessName =
    (profile.businesses as { name: string } | null)?.name ?? '내 업체'

  return (
    <div className="min-h-screen flex">
      <Sidebar businessName={businessName} />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
