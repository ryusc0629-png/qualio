'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, ChevronRight, Rocket, X } from 'lucide-react'
import type { OnboardingStep } from '@/lib/utils/onboarding-steps'

// "오늘은 그만 보기" 한 날짜(KST)를 저장한다. 다음 날이 되면 다시 노출 → 매일 한 번 가볍게 푸시.
const SNOOZE_KEY = 'qualio:onboarding-snoozed-date'

// KST 기준 오늘 날짜(yyyy-mm-dd). Vercel(UTC)과 무관하게 클라이언트에서 한국 날짜로 계산.
function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

interface Props {
  steps: OnboardingStep[]
  done: number
  total: number
  nextLabel: string | null
}

// 온보딩 체크리스트의 화면 표시 + "나중에 할게요"(오늘 하루 숨김).
// 닫아도 영구 삭제가 아니라 그날 하루만 숨기고 다음 날 다시 뜬다(localStorage, 마이그레이션 불필요).
export function OnboardingChecklistCard({ steps, done, total, nextLabel }: Props) {
  const [mounted, setMounted] = useState(false)
  const [snoozed, setSnoozed] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined' && localStorage.getItem(SNOOZE_KEY) === todayKST()) {
      setSnoozed(true) // 오늘 이미 닫음 → 내일 다시 노출
    }
  }, [])

  // localStorage 확인 전에는 렌더하지 않음 → 닫은 사용자에게 깜빡임 노출 방지
  if (!mounted || snoozed) return null

  const pct = Math.round((done / total) * 100)

  function handleSnooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, todayKST())
    } catch {
      // localStorage 접근 불가(시크릿 모드 등)여도 이번 세션에선 숨김
    }
    setSnoozed(true)
  }

  return (
    <section className="relative rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
      {/* 나중에 할게요(닫기) */}
      <button
        type="button"
        onClick={handleSnooze}
        title="오늘 하루 숨겨요. 내일 다시 보여드릴게요."
        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
      >
        오늘은 그만 보기
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3 pr-24">
        <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Rocket className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold">퀄리오 시작하기</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {nextLabel ? `다음 할 일: ${nextLabel}` : '거의 다 됐어요!'}
          </p>
        </div>
        <span className="shrink-0 self-center text-sm font-semibold text-primary tabular-nums">
          {done}/{total} 완료
        </span>
      </div>

      {/* 진행률 막대 */}
      <div className="h-2 w-full rounded-full bg-primary/10 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* 단계 목록 */}
      <ul className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.key}>
            {step.done ? (
              <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/40">
                  {step.label}
                </span>
              </div>
            ) : (
              <Link
                href={step.href}
                className="flex items-center gap-3 rounded-xl bg-white border border-border px-3 py-2.5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{step.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
                  {step.cta}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
