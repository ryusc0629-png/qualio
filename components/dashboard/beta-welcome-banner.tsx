'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, Bug } from 'lucide-react'
import { PLANS } from '@/lib/config/plans'
import { formatMoney } from '@/lib/format/money'
import { LAUNCH_DATE_LABEL, isBeforeLaunch } from '@/lib/config/beta'

// 한 번 닫으면 다시 안 뜨게 기억하는 키
const DISMISS_KEY = 'qualio-beta-welcome-dismissed'

// 회원가입 직후 대시보드에서 보이는 베타 안내 배너.
// ① 지금이 베타 기간이라는 것 ② 어떤 요금제 기능을 무료로 쓰는지 ③ 오류 신고 방법을 알려준다.
// 베타 개방 기간(NEXT_PUBLIC_BETA_OPEN=true)에만 노출 → 유료 결제를 켜면 자동으로 사라진다.
export function BetaWelcomeBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_BETA_OPEN !== 'true') return
    if (localStorage.getItem(DISMISS_KEY) === '1') return
    // 배너를 닫았는지는 브라우저에만 있는 정보라 화면이 뜬 뒤에야 알 수 있다.
    // 서버에서 미리 보여줬다가 지우면 이미 닫은 사람에게 배너가 깜빡이므로 이 순서가 맞다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true)
  }, [])

  if (!show) return null

  // 실제 최상위(확장) 플랜 가격을 그대로 표시 — 가격이 바뀌어도 자동 반영
  const scalePrice = formatMoney(PLANS.scale.price)
  const beforeLaunch = isBeforeLaunch()

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  return (
    <div className="relative rounded-xl border border-emerald-200 bg-emerald-50 p-4 pr-10">
      <button
        type="button"
        onClick={dismiss}
        aria-label="안내 닫기"
        className="absolute right-3 top-3 text-emerald-600/60 transition-colors hover:text-emerald-700"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-emerald-900">🎉 베타 테스트 진행 중이에요</p>
          <p className="text-sm leading-relaxed text-emerald-800">
            지금은 가장 높은{' '}
            <span className="font-semibold">‘확장’ 요금제(월 {scalePrice})</span>의 모든 기능을
            <span className="font-semibold"> 무료로</span> 쓰고 계세요. 마음껏 사용해보세요.
          </p>
          {/* 언제까지 무료인지 — 사장님이 갑자기 결제 안내를 받는 일이 없게 미리 알린다 */}
          <p className="text-sm leading-relaxed text-emerald-800">
            정식 런칭은 <span className="font-semibold">{LAUNCH_DATE_LABEL}</span>이에요.
            {beforeLaunch && ' 그때까지는 요금이 청구되지 않아요.'}
          </p>
          <p className="flex items-start gap-1.5 text-sm leading-relaxed text-emerald-800">
            <Bug className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              베타 기간이라 가끔 오류가 있을 수 있어요. 문제가 생기면 화면{' '}
              <span className="font-semibold">오른쪽 아래 ‘오류 신고’ 버튼</span>을 눌러 알려주세요.
              바로 확인해서 고쳐드릴게요.
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
