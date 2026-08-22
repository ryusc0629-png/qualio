'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// 로그인 입력값 검증 스키마
// 화면(login/page.tsx)과 같은 기준 — 빈칸만 막고 길이는 보지 않는다.
// 로그인은 '맞나 틀리나'만 가리면 되고, 가입 기준(8자)을 여기서 또 재면
// 그 전에 6자로 가입한 계정이 로그인 자체를 못 하게 된다.
const loginSchema = z.object({
  email: z.string().min(1, '이메일을 입력해주세요').email('이메일 주소를 다시 확인해주세요 (예: hong@naver.com)'),
  password: z.string().min(1, '비밀번호를 입력해주세요'),
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

    // 실패 원인을 구분해서 알려준다.
    // 예전엔 모든 실패를 "이메일 또는 비밀번호가 올바르지 않습니다" 한 줄로 덮어써서,
    // 서버가 잠깐 죽어도·시도 횟수를 넘겨도 사장님 눈엔 "비번 틀림"으로만 보였다.
    // 단, 계정이 있는지 없는지는 여전히 알려주지 않는다(계정 존재 여부 캐내기 방지).
    if (error) {
      console.error('[login] 로그인 실패:', error.code, error.message)

      if (error.code === 'email_not_confirmed') {
        throw new Error('[APP] 이메일 확인이 아직 안 됐어요. 받으신 메일의 링크를 눌러주세요')
      }
      if (error.status === 429 || error.code === 'over_request_rate_limit') {
        throw new Error('[APP] 로그인 시도가 너무 많았어요. 1분 뒤에 다시 눌러주세요')
      }
      if (error.code === 'invalid_credentials') {
        throw new Error('[APP] 이메일 또는 비밀번호가 맞지 않아요. 다시 확인해주세요')
      }
      // 서버 오류 등 — 사장님 잘못이 아니라는 걸 알려준다
      throw new Error('[APP] 지금은 로그인이 안 돼요. 잠시 후 다시 시도해주세요')
    }

    // 임시 비밀번호로 들어온 계정은 곧장 '새 비밀번호 정하기'로 — 대시보드를 스쳐가지 않게 한다
    if (data.user.app_metadata?.must_change_password) {
      return { redirectTo: '/new-password' }
    }

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

// 로그아웃 액션 — 세션 삭제만 하고, 페이지 이동은 클라이언트에서 window.location.replace로 처리
// (서버액션 redirect는 서버 컴포넌트 캐시가 남아 로그아웃됐는데도 화면이 대시보드에 머무를 수 있음)
export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return { success: true }
}

// 비밀번호 변경 — 로그인한 사장님이 직접 바꾼다.
//
// 왜 '지금 쓰는 비밀번호'를 다시 받나: Supabase는 세션만 있으면 바꿔준다. 그러면 사장님이
// 로그인된 폰·PC를 잠깐 두고 자리를 비운 사이 남이 비밀번호를 바꿔 계정을 통째로 가져갈 수 있다.
// 한 번 더 확인하는 게 맞다.
// ★길이 기준은 회원가입(8자)과 같게 맞춘다 — 한 서비스 안에서 기준이 두 개면
//   "가입은 8자인데 왜 여기선 6자?"가 되고, 짧은 쪽으로 새는 문이 된다.
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '지금 쓰는 비밀번호를 입력해주세요'),
  newPassword: z.string().min(8, '새 비밀번호는 8자 이상으로 정해주세요'),
})

export const changePasswordAction = action
  .schema(changePasswordSchema)
  .action(async ({ parsedInput: { currentPassword, newPassword } }) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) throw new Error('[APP] 로그인이 필요합니다')

    // 지금 비밀번호가 맞는지 확인 (틀리면 여기서 끝)
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (verifyError) throw new Error('[APP] 지금 쓰는 비밀번호가 맞지 않아요')

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      console.error('[Auth] 비밀번호 변경 실패:', error)
      throw new Error('[APP] 비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해주세요')
    }

    return { success: true }
  })

// 임시 비밀번호로 들어온 사장님이 새 비밀번호를 정하는 액션.
// 여기선 '지금 쓰는 비밀번호'를 다시 묻지 않는다 — 방금 그 비밀번호로 로그인해 세션이 있고,
// 한 번 더 물으면 종이에 적어둔 임시 비번을 또 옮겨 적게 만들어 실패만 늘어난다.
export const setNewPasswordAction = action
  .schema(z.object({ newPassword: z.string().min(8, '비밀번호는 8자 이상으로 정해주세요') }))
  .action(async ({ parsedInput: { newPassword } }) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      console.error('[Auth] 새 비밀번호 저장 실패:', error)
      throw new Error('[APP] 저장하지 못했어요. 잠시 후 다시 시도해주세요')
    }

    // '새 비번 정해야 함' 표시를 지운다 — 안 지우면 로그인할 때마다 이 화면이 다시 뜬다.
    // app_metadata는 본인이 못 고치므로 service_role로 지운다.
    const admin = createServiceClient()
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { must_change_password: false },
    })
    if (metaError) console.error('[Auth] must_change_password 해제 실패:', metaError)

    return { success: true }
  })
