import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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

/**
 * 서버 액션용 관리자 게이트. 페이지가 아니라 액션에서 호출한다.
 * requireAdmin은 redirect(페이지 전용)를 쓰므로, 액션에서는 이 함수로 [APP] 에러를 던진다.
 */
export async function assertAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !isAdminEmail(user.email)) {
    throw new Error('[APP] 관리자만 접근할 수 있어요')
  }
  return user
}

/**
 * ADMIN_EMAILS에 등록된 관리자들의 business_id 목록을 반환한다.
 * 사전신청 등 '본사에게 보내는' 푸시 알림의 발송 대상을 하드코딩 없이 해석하기 위한 헬퍼.
 * (이메일 → auth 유저 → profiles.business_id 순으로 런타임 조회. 베타 규모라 1페이지로 충분.)
 */
export async function getAdminBusinessIds(): Promise<string[]> {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (adminEmails.length === 0) return []

  const db = createServiceClient()

  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error || !data) {
    console.error('[Admin] 관리자 유저 조회 실패:', error)
    return []
  }

  const adminUserIds = data.users
    .filter((u) => adminEmails.includes((u.email ?? '').toLowerCase()))
    .map((u) => u.id)
  if (adminUserIds.length === 0) return []

  const { data: profiles } = await db
    .from('profiles')
    .select('business_id')
    .in('id', adminUserIds)

  const ids = (profiles ?? [])
    .map((p) => p.business_id)
    .filter((v): v is string => Boolean(v))

  return Array.from(new Set(ids))
}
