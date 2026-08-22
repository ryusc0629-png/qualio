import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewPasswordForm } from './new-password-form'

// 임시 비밀번호로 로그인하면 대시보드보다 먼저 여기로 온다.
// 안 그러면 사장님은 설정 화면을 찾아가지 않아 임시 비밀번호를 계속 쓰게 되고,
// 다음에 또 "비밀번호를 잊었다"는 전화가 온다.
export default async function NewPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  // 이미 자기 비밀번호를 정한 사람은 여기 머무를 이유가 없다
  if (!user.app_metadata?.must_change_password) redirect('/dashboard')

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm space-y-4">
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold">새 비밀번호를 정해주세요</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            지금 쓰신 건 임시 비밀번호예요. 앞으로 쓰실 비밀번호를 한 번만 정하면 끝나요.
          </p>
        </div>
        <NewPasswordForm />
      </div>
    </div>
  )
}
