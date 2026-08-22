'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { KeyRound, Loader2, Copy, Check } from 'lucide-react'
import { resetBusinessPasswordAction } from '@/lib/actions/admin-account'

interface Props {
  businessId: string
  businessName: string
  ownerEmail: string | null
}

// CS 전화 대응용 — "비밀번호를 잊었다"는 전화가 오면 이 버튼 하나로 끝난다.
// 비밀번호는 해시로만 저장돼 원문을 알려줄 수 없으므로, 새 임시 비밀번호를 만들어 불러준다.
export function ResetPasswordButton({ businessId, businessName, ownerEmail }: Props) {
  const [result, setResult] = useState<{ email: string | null; tempPassword: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const { execute, isPending } = useAction(resetBusinessPasswordAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      setResult({ email: data.email, tempPassword: data.tempPassword })
      toast.success('임시 비밀번호를 만들었어요')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '초기화하지 못했어요'),
  })

  const copyAll = async () => {
    if (!result) return
    await navigator.clipboard.writeText(
      `아이디: ${result.email ?? ''}\n임시 비밀번호: ${result.tempPassword}`
    )
    setCopied(true)
    toast.success('복사했어요')
    setTimeout(() => setCopied(false), 2000)
  }

  if (result) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
        <p className="text-sm font-semibold text-emerald-900">임시 비밀번호를 만들었어요</p>
        <div className="rounded-lg bg-white border px-3 py-2 space-y-1">
          <p className="text-xs text-muted-foreground">아이디</p>
          <p className="text-sm font-medium break-all">{result.email ?? '이메일 없음'}</p>
          <p className="text-xs text-muted-foreground pt-1">임시 비밀번호</p>
          <p className="text-lg font-bold tracking-wide tabular-nums">{result.tempPassword}</p>
        </div>
        <button
          type="button"
          onClick={copyAll}
          className="h-10 w-full rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-700 transition-colors"
        >
          {copied ? <><Check className="h-4 w-4" />복사됨</> : <><Copy className="h-4 w-4" />복사해서 전달하기</>}
        </button>
        <p className="text-[11px] text-emerald-800 leading-relaxed">
          이 화면을 벗어나면 다시 볼 수 없어요(저장해두지 않습니다). 전화나 문자로 알려주시고,
          로그인한 뒤 설정 → 계정에서 본인이 새 비밀번호로 바꾸도록 안내해 주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-4 space-y-2">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-sm font-semibold">비밀번호를 잊으셨대요?</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        비밀번호는 암호화돼 있어 원래 값을 알 수 없어요. 대신 임시 비밀번호를 만들어 전화로
        알려주시면 됩니다. {ownerEmail ? `아이디는 ${ownerEmail} 이에요.` : ''}
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (confirm(`${businessName}의 비밀번호를 초기화할까요?\n지금 쓰던 비밀번호는 즉시 못 쓰게 됩니다.`)) {
            execute({ businessId })
          }
        }}
        className="h-10 w-full rounded-lg border bg-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-slate-50 disabled:opacity-60 transition-colors"
      >
        {isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" />만드는 중...</>
          : <><KeyRound className="h-4 w-4" />임시 비밀번호 만들기</>}
      </button>
    </div>
  )
}
