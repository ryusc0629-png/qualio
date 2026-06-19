import { createServiceClient } from '@/lib/supabase/server'
import { buildOnboardingSteps, onboardingProgress } from '@/lib/utils/onboarding-steps'
import { OnboardingChecklistCard } from '@/components/dashboard/onboarding-checklist-card'

// 첫 이용 온보딩 진행 체크리스트(서버).
// 핵심 매출 흐름의 셋업 상태를 DB에서 읽어 단계별 완료 여부를 계산하고,
// 표시·닫기 동작은 클라이언트 카드에 위임한다.
// 모든 단계가 끝나면 아예 렌더하지 않는다(자동 사라짐).
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

  // 셋업을 모두 마치면 노출하지 않음
  if (allDone) return null

  return (
    <OnboardingChecklistCard
      steps={steps}
      done={done}
      total={total}
      nextLabel={nextStep?.label ?? null}
    />
  )
}
