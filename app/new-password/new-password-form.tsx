'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { setNewPasswordAction } from '@/lib/actions/auth'

export function NewPasswordForm() {
  const [password, setPassword] = useState('')
  // 비테크 사장님은 점(●)만 보이면 오타를 못 잡는다 — 눈 버튼으로 직접 확인하게 한다
  const [visible, setVisible] = useState(false)

  const { execute, isPending } = useAction(setNewPasswordAction, {
    onSuccess: () => {
      toast.success('비밀번호를 정했어요!')
      // 서버 컴포넌트 캐시까지 갱신되도록 replace 사용
      window.location.replace('/dashboard')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '저장하지 못했어요. 다시 시도해주세요'),
  })

  const tooShort = password.length > 0 && password.length < 6

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">앞으로 쓸 비밀번호 (필수)</label>
        <div className="relative">
          <Input
            type={visible ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            autoComplete="new-password"
            className="h-12 pr-11"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title={visible ? '숨기기' : '보기'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {tooShort && <p className="text-xs text-red-600">6자 이상으로 정해주세요</p>}
      </div>

      <Button
        type="button"
        disabled={password.length < 6 || isPending}
        onClick={() => execute({ newPassword: password })}
        className="h-12 w-full gap-2"
      >
        {isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" />저장 중...</>
          : <><KeyRound className="h-4 w-4" />이 비밀번호로 정하기</>}
      </Button>

      <p className="text-xs text-muted-foreground leading-relaxed">
        정하고 나면 바로 퀄리오로 들어가요. 다음부터는 이 비밀번호로 로그인하시면 됩니다.
      </p>
    </div>
  )
}
