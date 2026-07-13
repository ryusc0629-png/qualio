'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// 로그인 입력값 검증 스키마
const loginSchema = z.object({
  email: z.string().email('올바른 이메일 형식이 아닙니다'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
  // 로그인 후 복귀할 원래 목적지 (알림 클릭 등으로 진입 시 proxy가 채워줌)
  next: z.string().optional(),
})

// 오픈 리다이렉트 방지 — 앱 내부 경로만 허용 (/로 시작, //·/\ 같은 외부/프로토콜상대 주소 거부)
function safeInternalPath(next: string | undefined): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null
  }
  return next
}

// 회원가입 입력값 검증 스키마
const signupSchema = z.object({
  fullName: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  email: z.string().email('올바른 이메일 형식이 아닙니다'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
})

// 로그인 액션 — 성공 시 이동할 경로 반환 (업체 등록 여부에 따라 분기)
export const loginAction = action
  .schema(loginSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsedInput.email,
      password: parsedInput.password,
    })

    if (error) throw new Error('[APP] 이메일 또는 비밀번호가 올바르지 않습니다')

    // 업체 등록 여부 확인 — 서비스 롤로 조회 (로그인 직후 세션 쿠키 타이밍 문제 방지)
    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', data.user.id)
      .single()

    // 업체 등록이 끝난 사용자만 원래 목적지(next)로 복귀 —
    // 온보딩 전이면 대시보드 접근이 불가하므로 next를 무시하고 온보딩으로 보낸다
    return {
      redirectTo: profile?.business_id
        ? safeInternalPath(parsedInput.next) ?? '/dashboard'
        : '/onboarding',
    }
  })

// 회원가입 액션 — 이메일 인증 활성화 여부에 따라 분기
// session이 있으면 바로 온보딩으로, 없으면 이메일 확인 안내
export const signupAction = action
  .schema(signupSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signUp({
      email: parsedInput.email,
      password: parsedInput.password,
      options: {
        data: { full_name: parsedInput.fullName },
      },
    })

    if (error) {
      console.error('[signupAction] Supabase error:', error.message, error.code)
      if (error.message.includes('already registered')) {
        throw new Error('[APP] 이미 가입된 이메일입니다')
      }
      throw new Error('[APP] 회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }

    // 세션이 없으면 이메일 인증이 필요한 상태 (Supabase Email Confirm 활성화)
    if (!data.session) {
      return { emailConfirmation: true }
    }

    return { redirectTo: '/onboarding' }
  })

// 로그아웃 액션 — 세션 삭제 후 로그인 페이지로 이동
export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
