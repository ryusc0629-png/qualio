import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { createInternalClient } from '@/lib/supabase/internal'
import { getRecurringRevenue } from '@/lib/utils/recurring-revenue'
import { quoteModules, type ModuleId, type ModuleQuote } from '@/lib/config/modules'

// ────────────────────────────────────────────────────────────────────────────
// 모듈 구독 — 업체가 켠 모듈을 읽어 이번 달 요금을 만든다.
//
// ★값을 매기는 세 숫자 중 둘은 저장하지 않고 그때그때 센다:
//     직원 수    → workers 테이블의 살아 있는 행
//     정기 매출  → contracts의 활성 계약 월 환산 합계
//   저장해두면 직원이 늘어도 요금이 그대로라 '커지면 같이 커진다'가 깨진다.
//   business_modules에 담는 건 '켰나'와 '지역 수'뿐이다.
//
// ⚠️그래서 요금은 달마다 바뀔 수 있다. 결제 검증이 주문 만들 때 금액과 대조하므로,
//   주문 생성과 검증 사이에 직원이 늘면 금액이 어긋난다.
//   → 그래서 주문에 금액을 박아두고 검증은 그 값과 대조한다(quoteFor를 두 번 부르지 않는다).
// ────────────────────────────────────────────────────────────────────────────

// business_modules는 database.ts 타입에 아직 없어 제네릭 없는 클라이언트로 접근한다
const looseDb = createInternalClient

export interface EnabledModule {
  moduleId: ModuleId
  regions: number
}

/** 이 업체가 지금 켜둔 모듈 */
export async function getEnabledModules(businessId: string): Promise<EnabledModule[]> {
  const { data } = await looseDb()
    .from('business_modules')
    .select('module_id, regions')
    .eq('business_id', businessId)
    .is('disabled_at', null)

  return ((data ?? []) as { module_id: ModuleId; regions: number }[]).map((r) => ({
    moduleId: r.module_id,
    regions: r.regions,
  }))
}

/** 모듈 구독을 쓰는 업체인가 — 하나라도 켰으면 모듈 요금제다 */
export async function isModuleSubscriber(businessId: string): Promise<boolean> {
  return (await getEnabledModules(businessId)).length > 0
}

/** 살아 있는 직원·도급사 수 — 현장 Pro의 과금 근거 */
async function countWorkers(db: SupabaseClient, businessId: string): Promise<number> {
  const { count } = await db
    .from('workers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
  return count ?? 0
}

export interface ModuleQuoteResult extends ModuleQuote {
  /** 계산에 쓴 실제 숫자 — 화면에 "왜 이 금액인지" 보여줄 때 쓴다 */
  basis: { workers: number; regions: number; recurringRevenue: number }
}

/**
 * 이 업체의 이번 달 모듈 요금(공급가액, 할인 전).
 * ★화면과 결제가 반드시 같은 함수를 써야 한다 — 각자 더하면 금액이 어긋나 결제가 튕긴다.
 */
export async function quoteFor(businessId: string): Promise<ModuleQuoteResult> {
  const db = createServiceClient()
  const enabled = await getEnabledModules(businessId)
  const on = (id: ModuleId) => enabled.find((e) => e.moduleId === id)

  const [workers, recurringRevenue] = await Promise.all([
    on('field') ? countWorkers(db, businessId) : Promise.resolve(0),
    on('client') ? getRecurringRevenue(db, businessId) : Promise.resolve(0),
  ])
  const regions = on('marketing')?.regions ?? 0

  // 거래처 Pro는 정기 매출이 0이어도 켰으면 최소 요금을 낸다.
  // (계약을 아직 안 넣었을 뿐 시스템은 똑같이 돌아간다)
  const basis = {
    workers,
    regions,
    recurringRevenue: on('client') ? Math.max(1, recurringRevenue) : 0,
  }

  return { ...quoteModules(basis), basis: { workers, regions, recurringRevenue } }
}

/** 모듈을 켠다 (이미 켜져 있으면 지역 수만 갱신) */
export async function enableModule(
  businessId: string,
  moduleId: ModuleId,
  regions = 1,
): Promise<void> {
  await looseDb()
    .from('business_modules')
    .upsert(
      {
        business_id: businessId,
        module_id: moduleId,
        regions: moduleId === 'marketing' ? Math.max(1, regions) : 1,
        enabled_at: new Date().toISOString(),
        disabled_at: null,
      },
      { onConflict: 'business_id,module_id' },
    )
}

/**
 * 모듈을 끈다.
 * ⛔행을 지우지 말 것 — 데이터는 그대로 두고 화면만 잠근다. 다시 켜면 돌아온다.
 */
export async function disableModule(businessId: string, moduleId: ModuleId): Promise<void> {
  await looseDb()
    .from('business_modules')
    .update({ disabled_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('module_id', moduleId)
}
