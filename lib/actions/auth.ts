'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// 로그인 입력값 검증 스키마
const loginSchema = z.object({
  email: z.string().email('올바른 이메일 형식이 아닙니다'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
})

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

    if (error) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다')

    // 업체 등록 여부 확인 — 없으면 온보딩으로 이동
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_id')
      .eq('id', data.user.id)
      .single()

    return {
      redirectTo: profile?.business_id ? '/dashboard' : '/onboarding',
    }
  })

// 회원가입 액션 — 성공 시 온보딩으로 이동
export const signupAction = action
  .schema(signupSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient()

    const { error } = await supabase.auth.signUp({
      email: parsedInput.email,
      password: parsedInput.password,
      options: {
        data: { full_name: parsedInput.fullName },
      },
    })

    if (error) {
      // 원인 파악용 실제 오류 메시지 노출 (진단 후 한국어로 교체 예정)
      console.error('[signupAction] Supabase error:', error.message, error.code)
      if (error.message.includes('already registered')) {
        throw new Error('이미 가입된 이메일입니다')
      }
      throw new Error(`[Supabase] ${error.message}`)
    }

    return { redirectTo: '/onboarding' }
  })

// 로그아웃 액션 — 세션 삭제 후 로그인 페이지로 이동
export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
