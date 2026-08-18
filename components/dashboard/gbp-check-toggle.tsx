'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { toggleGbpCheckAction } from '@/lib/actions/gbp'

// 구글 비즈니스 프로필 점검 항목 한 칸 — 확인했으면 눌러서 켠다.
// 누르는 즉시 화면에 반영하고(낙관적) 저장은 뒤에서 한다. 실패하면 되돌린다.
export function GbpCheckToggle({
  itemKey,
  done,
  label,
}: {
  itemKey: string
  done: boolean
  label: string
}) {
  const router = useRouter()
  const [on, setOn] = useState(done)

  const { execute, isPending } = useAction(toggleGbpCheckAction, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => {
      setOn((v) => !v) // 되돌리기
      toast.error(error.serverError ?? '저장 못 했어요. 다시 눌러주세요')
    },
  })

  return (
    <button
      type="button"
      disabled={isPending}
      aria-pressed={on}
      onClick={() => {
        const next = !on
        setOn(next)
        execute({ key: itemKey, done: next })
      }}
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
        on ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
      }`}
      title={on ? `${label} — 확인함(누르면 해제)` : `${label} — 확인했으면 눌러주세요`}
    >
      {on ? '✓' : ''}
      <span className="sr-only">{label}</span>
    </button>
  )
}
