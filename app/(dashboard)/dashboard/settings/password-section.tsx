'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { KeyRound, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { changePasswordAction } from '@/lib/actions/auth'

// 사장님이 직접 비밀번호를 바꾸는 곳.
// 지금 쓰는 비밀번호를 한 번 확인받는다 — 폰을 잠깐 두고 자리를 비운 사이 남이 바꿔버리는 걸 막는다.
export function PasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const { execute, isPending } = useAction(changePasswordAction, {
    onSuccess: () => {
      setCurrent('')
      setNext('')
      toast.success('비밀번호를 바꿨어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '바꾸지 못했어요. 다시 시도해주세요'),
  })

  const canSubmit = current.length >= 6 && next.length >= 6 && !isPending

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">지금 쓰는 비밀번호 (필수)</label>
        <Input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="지금 로그인할 때 쓰는 비밀번호"
          autoComplete="current-password"
          className="h-12"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">새 비밀번호 (필수)</label>
        <Input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="6자 이상"
          autoComplete="new-password"
          className="h-12"
        />
        {next.length > 0 && next.length < 6 && (
          <p className="text-xs text-red-600">6자 이상으로 정해주세요</p>
        )}
      </div>

      <Button
        type="button"
        disabled={!canSubmit}
        onClick={() => execute({ currentPassword: current, newPassword: next })}
        className="h-12 w-full gap-2"
      >
        {isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" />바꾸는 중...</>
          : <><KeyRound className="h-4 w-4" />비밀번호 바꾸기</>}
      </Button>

      <p className="text-xs text-muted-foreground leading-relaxed">
        비밀번호를 잊어버리셨다면 퀄리오로 연락 주세요. 저장된 비밀번호는 암호화돼 있어 저희도 볼 수
        없지만, 새 임시 비밀번호를 만들어 알려드릴 수 있어요.
      </p>
    </div>
  )
}
