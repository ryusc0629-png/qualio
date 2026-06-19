import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CheckCircle2, Circle, ChevronRight, Rocket } from 'lucide-react'
import { buildOnboardingSteps, onboardingProgress } from '@/lib/utils/onboarding-steps'

// 첫 이용 온보딩 진행 체크리스트.
// 핵심 매출 흐름의 셋업 상태를 DB에서 읽어 "어디까지 했는지" 보여준다.
// 모든 단계가 끝나면 스스로 사라진다(렌더 안 함).
export async function OnboardingChecklist({ businessId }: { businessId: string }) {
  const db = createServiceClient()

  const [
    { count: serviceItems },
    { count: quoteTiers },
    { count: quotes },
    { count: bookings },
    { count: completedBookings },
  ] = await Promise.all([
    db.from('service_items').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('quote_tiers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('quotes').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', businessId).is('deleted_at', null),
    db.from('bookings').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('status', 'completed').is('deleted_at', null),
  ])

  const steps = buildOnboardingSteps({
    serviceItems: serviceItems ?? 0,
    quoteTiers: quoteTiers ?? 0,
    quotes: quotes ?? 0,
    bookings: bookings ?? 0,
    completedBookings: completedBookings ?? 0,
  })

  const { done, total, allDone, nextStep } = onboardingProgress(steps)

  // 셋업을 모두 마치면 더 이상 노출하지 않음
  if (allDone) return null

  const pct = Math.round((done / total) * 100)

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Rocket className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold">퀄리오 시작하기</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {nextStep
              ? `다음 할 일: ${nextStep.label}`
              : '거의 다 됐어요!'}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">
          {done}/{total} 완료
        </span>
      </div>

      {/* 진행률 막대 */}
      <div className="h-2 w-full rounded-full bg-primary/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
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
