'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { KeyRound, Loader2, Eye, EyeOff, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { changePasswordAction } from '@/lib/actions/auth'

// 길이 기준은 회원가입과 같은 8자 (lib/actions/auth.ts의 스키마와 짝)
const MIN_LENGTH = 8

// 사장님이 직접 비밀번호를 바꾸는 곳.
// 지금 쓰는 비밀번호를 한 번 확인받는다 — 폰을 잠깐 두고 자리를 비운 사이 남이 바꿔버리는 걸 막는다.
export function PasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)

  const { execute, isPending } = useAction(changePasswordAction, {
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('비밀번호를 바꿨어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '바꾸지 못했어요. 다시 시도해주세요'),
  })

  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== next
  const matched = next.length >= MIN_LENGTH && confirm === next
  const canSubmit = current.length > 0 && matched && !isPending

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
        <div className="relative">
          <Input
            type={visible ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="8자 이상"
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
        {tooShort && <p className="text-xs text-red-600">8자 이상으로 정해주세요</p>}
      </div>

      {/* 한 번 더 — 오타로 바꿔버리면 다음 로그인이 막힌다 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">새 비밀번호 한 번 더 (필수)</label>
        <Input
          type={visible ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="위와 똑같이 입력해주세요"
          autoComplete="new-password"
          className="h-12"
        />
        {mismatch && <p className="text-xs text-red-600">위에 적으신 것과 달라요. 다시 확인해주세요</p>}
        {matched && (
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" />두 번 다 같아요
          </p>
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
