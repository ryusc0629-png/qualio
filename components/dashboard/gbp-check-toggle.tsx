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
  variant = 'dot',
}: {
  itemKey: string
  done: boolean
  label: string
  /** dot = 목록의 작은 동그라미 / button = '지금 할 일' 카드 안의 큰 버튼 */
  variant?: 'dot' | 'button'
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

  const toggle = () => {
    const next = !on
    setOn(next)
    execute({ key: itemKey, done: next })
  }

  // '지금 할 일'로 올라온 항목은 목록에서 빠지기 때문에 누를 동그라미가 없었다.
  // 그래서 이미 해둔 일인데도 영영 다음 칸으로 넘어가지 않았다(사장님이 업종을 이미
  // '청소전문업체'로 바꿔뒀는데 화면엔 계속 '지금 할 일'로 떠 있었다).
  if (variant === 'button') {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={toggle}
        className="h-12 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border-2 border-emerald-600 bg-white px-4 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
      >
        ✓ 이미 해뒀어요
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={isPending}
      aria-pressed={on}
      onClick={toggle}
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
