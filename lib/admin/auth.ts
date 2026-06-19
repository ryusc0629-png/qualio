import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// 관리자(퀄리오 본사 팀) 여부 — ADMIN_EMAILS 환경변수에 등록된 이메일만 통과
// 기존 대시보드 게이팅과 동일한 방식을 사용한다.
export function isAdminEmail(email: string | null | undefined): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  return adminEmails.includes(email ?? '')
}

/**
 * /admin 영역 진입 게이트. 서버 컴포넌트(레이아웃/페이지)에서 호출한다.
 * - 미로그인 → 로그인 페이지
 * - 로그인했지만 관리자 아님 → 대시보드 (관리자 영역 존재를 노출하지 않음)
 * 통과 시 관리자 user 정보를 반환한다.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (!isAdminEmail(user.email)) redirect('/dashboard')

  return user
}
