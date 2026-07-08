'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { recommendServiceTierItems } from '@/lib/ai/service-tier-items'
import { revalidatePath } from 'next/cache'

const VALID_UNITS = ['정액', '평당', '시간', '개', '상담'] as const

// AC 유형별 단가 스키마
const acTypePricesSchema = z.record(z.string(), z.number().min(0)).optional()

// 항목별 단가 스키마 — [{name, price, variant?}]
// variant가 있으면 신축/구축처럼 구분별 단가, 없으면 단일 단가
const unitPricesSchema = z.array(z.object({
  name:    z.string().min(1),
  price:   z.number().min(0),
  variant: z.string().optional(),
})).optional()

// 항목별 구분 목록 스키마 — ["신축", "구축"]
const unitVariantsSchema = z.array(z.string().min(1)).optional()

// 서비스 항목 생성 스키마 — z.enum() 대신 z.string().refine() 사용 (Zod v4 호환)
const createServiceItemSchema = z.object({
  name: z.string().min(1, '서비스명을 입력해주세요'),
  category: z.string().optional(),
  base_price: z.coerce.number().min(0, '0 이상의 금액을 입력해주세요'),
  unit: z.string().refine(
    (val): val is typeof VALID_UNITS[number] => (VALID_UNITS as readonly string[]).includes(val),
    '올바른 단위를 선택해주세요'
  ),
  ac_type_prices:  acTypePricesSchema,
  unit_prices:     unitPricesSchema,
  unit_variants:   unitVariantsSchema,
})

// 서비스 항목 수정 스키마
const updateServiceItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, '서비스명을 입력해주세요'),
  category: z.string().optional(),
  base_price: z.coerce.number().min(0),
  unit: z.string().refine(
    (val): val is typeof VALID_UNITS[number] => (VALID_UNITS as readonly string[]).includes(val),
    '올바른 단위를 선택해주세요'
  ),
  photos: z.array(z.string()).optional(),
  ac_type_prices:  acTypePricesSchema,
  unit_prices:     unitPricesSchema,
  unit_variants:   unitVariantsSchema,
  tier_good_items:   z.array(z.string()).optional(),
  tier_better_items: z.array(z.string()).optional(),
  tier_best_items:   z.array(z.string()).optional(),
  // 서비스별 플랜 할인 (선택)
  tier_good_discount_rate:     z.number().min(0).max(100).optional(),
  tier_good_discount_amount:   z.number().min(0).optional(),
  tier_better_discount_rate:   z.number().min(0).max(100).optional(),
  tier_better_discount_amount: z.number().min(0).optional(),
  tier_best_discount_rate:     z.number().min(0).max(100).optional(),
  tier_best_discount_amount:   z.number().min(0).optional(),
})

// 서비스 항목 삭제 스키마
const deleteServiceItemSchema = z.object({
  id: z.string().uuid(),
})

// 업체의 AI 번들 캐시 초기화 (서비스 변경 시 호출 → 다음 견적 요청 시 AI 재생성)
async function invalidateBundleCache(db: ReturnType<typeof createServiceClient>, businessId: string) {
  const { data: tiers } = await db
    .from('quote_tiers')
    .select('id')
    .eq('business_id', businessId)

  if (!tiers || tiers.length === 0) return

  const tierIds = tiers.map((t) => t.id)
  await db.from('quote_tier_services').delete().in('tier_id', tierIds)
}

// 서비스 한 항목의 플랜(기본/추천/프리미엄) 구성 항목을 AI가 개별 추천
export const aiSuggestServiceTierItemsAction = action
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // 본인 업체의 서비스인지 확인하며 정보 조회
    const { data: service } = await db
      .from('service_items')
      .select('name, category, base_price, unit')
      .eq('id', parsedInput.id)
      .eq('business_id', profile.business_id)
      .maybeSingle()

    if (!service) throw new Error('[APP] 서비스를 찾을 수 없습니다')

    const items = await recommendServiceTierItems({
      name: service.name,
      category: service.category,
      basePrice: service.base_price,
      unit: service.unit,
    })

    return items
  })

// 서비스 항목 생성 액션
export const createServiceItemAction = action
  .schema(createServiceItemSchema)
  .action(async ({ parsedInput }) => {
    // 인증 확인
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('로그인이 필요합니다')

    // business_id 조회
    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.business_id) throw new Error('업체 정보를 찾을 수 없습니다')

    // 서비스 항목 생성
    const { error } = await db.from('service_items').insert({
      business_id:    profile.business_id,
      name:           parsedInput.name,
      category:       parsedInput.category ?? null,
      base_price:     parsedInput.base_price,
      unit:           parsedInput.unit,
      ac_type_prices: parsedInput.ac_type_prices ?? null,
      unit_prices:    parsedInput.unit_prices    ?? null,
      unit_variants:  parsedInput.unit_variants  ?? null,
    })

    if (error) throw new Error('[APP] 서비스 추가에 실패했습니다')

    // 서비스 변경 시 번들 캐시 초기화 → 다음 견적 요청 시 AI가 새로 구성
    await invalidateBundleCache(db, profile.business_id)

    revalidatePath('/dashboard/services')
    return { success: true }
  })

// 서비스 항목 수정 액션
export const updateServiceItemAction = action
  .schema(updateServiceItemSchema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { error } = await db
      .from('service_items')
      .update({
        name:              parsedInput.name,
        category:          parsedInput.category ?? null,
        base_price:        parsedInput.base_price,
        unit:              parsedInput.unit,
        photos:            parsedInput.photos ?? [],
        ac_type_prices:    parsedInput.ac_type_prices ?? null,
        unit_prices:       parsedInput.unit_prices    ?? null,
        unit_variants:     parsedInput.unit_variants  ?? null,
        tier_good_items:   parsedInput.tier_good_items ?? [],
        tier_better_items: parsedInput.tier_better_items ?? [],
        tier_best_items:   parsedInput.tier_best_items ?? [],
      })
      .eq('id', parsedInput.id)
      .eq('business_id', profile.business_id)

    if (error) throw new Error('[APP] 서비스 수정에 실패했습니다')

    // 플랜 할인 저장 — 컬럼이 아직 없으면(마이그레이션 전) 조용히 건너뜀
    const { error: discountError } = await db
      .from('service_items')
      .update({
        tier_good_discount_rate:     parsedInput.tier_good_discount_rate     ?? 0,
        tier_good_discount_amount:   parsedInput.tier_good_discount_amount   ?? 0,
        tier_better_discount_rate:   parsedInput.tier_better_discount_rate   ?? 0,
        tier_better_discount_amount: parsedInput.tier_better_discount_amount ?? 0,
        tier_best_discount_rate:     parsedInput.tier_best_discount_rate     ?? 0,
        tier_best_discount_amount:   parsedInput.tier_best_discount_amount   ?? 0,
      } as never)
      .eq('id', parsedInput.id)
      .eq('business_id', profile.business_id)
    if (discountError) console.error('[Services] 플랜 할인 저장 건너뜀(컬럼 미적용?):', discountError.message)

    await invalidateBundleCache(db, profile.business_id)
    revalidatePath('/dashboard/services')
    return { success: true }
  })

// 서비스 항목 삭제 액션 (soft delete)
export const deleteServiceItemAction = action
  .schema(deleteServiceItemSchema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.business_id) throw new Error('업체 정보를 찾을 수 없습니다')

    // 본인 업체 항목인지 확인 후 삭제
    const { error } = await db
      .from('service_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', parsedInput.id)
      .eq('business_id', profile.business_id)

    if (error) throw new Error('[APP] 서비스 삭제에 실패했습니다')

    // 서비스 변경 시 번들 캐시 초기화 → 다음 견적 요청 시 AI가 새로 구성
    await invalidateBundleCache(db, profile.business_id)

    revalidatePath('/dashboard/services')
    return { success: true }
  })
