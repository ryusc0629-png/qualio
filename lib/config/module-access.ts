import 'server-only'
import { createServiceClient } from '@/lib/supabase/server'
import { PLANS, type PlanId } from '@/lib/config/plans'
import type { ModuleId } from '@/lib/config/modules'

// ────────────────────────────────────────────────────────────────────────────
// 모듈이 켜져 있는가 — 판정 단일 소스.
//
// ★왜 필요한가: 지금 코드는 '플랜 하나로 전부 열림/닫힘'을 전제로 짜여 있다.
//   그래서 plans.ts에 b2bModule: false 라고 적어놔도 **그 값을 읽는 코드가 없었고**,
//   49,000원 내는 고객이 거래처 기능(견적서·시방서·계약서·정기계약·월간 리포트)을
//   전부 쓰고 있었다(2026-08-22 발견). 판정이 흩어져 있으면 이런 구멍이 또 생긴다.
//
// ⛔화면·크론·알림톡·현장 앱 어디서든 "이 기능 써도 되나"를 물을 때 **이 파일만 쓸 것.**
//   PLANS.xxx.b2bModule 같은 필드를 직접 읽지 말 것.
//
// ⚠️지금은 옛 3단 플랜을 모듈로 번역해서 답한다(PLAN_MODULES). 모듈별 구독이
//   실제로 붙으면 이 함수 안만 바꾸면 되고, 부르는 쪽은 손댈 필요가 없다.
// ────────────────────────────────────────────────────────────────────────────

/** 옛 플랜 → 지금 열려 있는 모듈. 모듈 구독이 붙으면 이 표는 사라진다 */
const PLAN_MODULES: Record<PlanId, ModuleId[]> = {
  // 베타는 확장과 같은 대우 — 전부 열림
  beta: ['field', 'marketing', 'client'],
  // 시작(49,000)은 기본만. 직원은 1명까지라 현장도 사실상 없다
  starter: [],
  // 성장(290,000)에서 거래처 묶음이 열린다 — 이 플랜의 핵심 가치
  pro: ['field', 'marketing', 'client'],
  scale: ['field', 'marketing', 'client'],
}

/** 이 플랜에서 이 모듈이 열려 있나 */
export function planHasModule(planId: PlanId, moduleId: ModuleId): boolean {
  return PLAN_MODULES[planId].includes(moduleId)
}

/** 업체의 현재 플랜 — 구독 행이 없으면 베타로 본다(가입 직후) */
export async function getPlanIdOf(businessId: string): Promise<PlanId> {
  const db = createServiceClient()
  const { data } = (await db
    .from('subscriptions')
    .select('plan' as never)
    .eq('business_id', businessId)
    .maybeSingle()) as unknown as { data: { plan: string } | null }

  const plan = data?.plan as PlanId | undefined
  return plan && plan in PLANS ? plan : 'beta'
}

/** 이 업체가 이 모듈을 쓸 수 있나 */
export async function hasModule(businessId: string, moduleId: ModuleId): Promise<boolean> {
  return planHasModule(await getPlanIdOf(businessId), moduleId)
}

/**
 * 이 모듈을 쓰려면 어느 플랜부터인지 — 잠금 안내에 쓴다.
 * "다 쓰셨어요"가 아니라 "○○ 플랜부터 쓸 수 있어요"로 나가야 사장님이 다음 행동을 안다.
 */
export function minPlanForModule(moduleId: ModuleId): PlanId | null {
  const order: PlanId[] = ['starter', 'pro', 'scale']
  return order.find((p) => planHasModule(p, moduleId)) ?? null
}
