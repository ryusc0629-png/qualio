'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { Check, Loader2 } from 'lucide-react'
import { optInCareReminderAction } from '@/lib/actions/reengagement'

interface Props {
  reportId: string
  businessId: string
  // '9월'처럼 보고서에 적힌 다음 점검 시점 — 있으면 문구가 구체적이 된다
  dueLabel?: string | null
  // 이미 동의한 고객이면 버튼 대신 완료 상태로 시작한다
  initialOptedIn: boolean
}

// 고객이 '다음 청소 시기에 알려주세요'를 고르는 자리.
// 청소가 끝나고 보고서를 받아 본 시점이라, 언제 다시 손봐야 하는지가 이미 문서에 적혀 있다.
// 그 약속을 지키겠다는 뜻이라 광고로 읽히지 않는다.
export function CareReminderOptIn({ reportId, businessId, dueLabel, initialOptedIn }: Props) {
  const [done, setDone] = useState(initialOptedIn)
  const { execute, isPending } = useAction(optInCareReminderAction, {
    onSuccess: () => setDone(true),
    onError: () => setDone(false),
  })

  if (done) {
    return (
      <div className="mt-4 border border-emerald-200 bg-emerald-50/60 px-5 py-4 break-inside-avoid print:hidden">
        <p className="text-[12px] text-emerald-800 flex items-center gap-1.5">
          <Check className="h-4 w-4 shrink-0" />
          {dueLabel ? `${dueLabel}쯤 문자로 알려드릴게요.` : '다음 청소 시기가 되면 문자로 알려드릴게요.'}
        </p>
        <p className="text-[11px] text-emerald-700/80 mt-1">
          문자 아래 &lsquo;수신거부&rsquo;를 누르시면 언제든 끌 수 있어요.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 border border-slate-200 px-5 py-4 flex items-center justify-between gap-4 flex-wrap break-inside-avoid print:hidden">
      <div className="min-w-0">
        <p className="text-[12px] text-slate-700">
          {dueLabel
            ? `${dueLabel}쯤 다시 점검할 때가 되면 문자로 알려드릴까요?`
            : '다음 청소 시기가 되면 문자로 알려드릴까요?'}
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          광고성 정보 수신에 동의하는 거예요. 문자 아래 &lsquo;수신거부&rsquo;로 언제든 끌 수 있어요.
        </p>
      </div>
      <button
        type="button"
        onClick={() => execute({ reportId, businessId })}
        disabled={isPending}
        className="text-[12px] font-semibold text-emerald-700 border border-emerald-600 px-3 py-1.5 hover:bg-emerald-50 disabled:opacity-60 transition-colors shrink-0 inline-flex items-center gap-1.5"
      >
        {isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />처리 중...</> : '네, 알려주세요'}
      </button>
    </div>
  )
}
