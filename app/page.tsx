import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// 루트 페이지 — 로그인 상태에 따라 적절한 경로로 리디렉트
export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 업체 등록 여부 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .single()

  redirect(profile?.business_id ? '/dashboard' : '/onboarding')
}
