'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, ChevronRight, Rocket, X } from 'lucide-react'
import type { OnboardingStep } from '@/lib/utils/onboarding-steps'

const DISMISS_KEY = 'qualio:onboarding-dismissed'

interface Props {
  steps: OnboardingStep[]
  done: number
  total: number
  nextLabel: string | null
}

// 온보딩 체크리스트의 화면 표시 + "나중에 할게요" 닫기.
// 닫기 상태는 localStorage에 저장 → 같은 기기에서 다시 뜨지 않음(마이그레이션 불필요).
export function OnboardingChecklistCard({ steps, done, total, nextLabel }: Props) {
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true)
    }
  }, [])

  // localStorage 확인 전에는 렌더하지 않음 → 닫은 사용자에게 깜빡임 노출 방지
  if (!mounted || dismissed) return null

  const pct = Math.round((done / total) * 100)

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // localStorage 접근 불가(시크릿 모드 등)여도 이번 세션에선 숨김
    }
    setDismissed(true)
  }

  return (
    <section className="relative rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
      {/* 나중에 할게요(닫기) */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
      >
        나중에 할게요
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
