'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const VALID_UNITS = ['정액', '평당', '시간', '개'] as const

// 서비스 항목 생성 스키마 — z.enum() 대신 z.string().refine() 사용 (Zod v4 호환)
const createServiceItemSchema = z.object({
  name: z.string().min(1, '서비스명을 입력해주세요'),
  category: z.string().optional(),
  base_price: z.coerce.number().min(0, '0 이상의 금액을 입력해주세요'),
  unit: z.string().refine(
    (val): val is typeof VALID_UNITS[number] => (VALID_UNITS as readonly string[]).includes(val),
    '올바른 단위를 선택해주세요'
  ),
})

// 견적폼 노출 토글 스키마
const toggleShowInQuoteSchema = z.object({
  id: z.string().uuid(),
  show_in_quote: z.boolean(),
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
  console.log('[Bundle] 번들 캐시 초기화 완료 — 다음 견적 시 AI 재생성')
}

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
      business_id: profile.business_id,
      name: parsedInput.name,
      category: parsedInput.category ?? null,
      base_price: parsedInput.base_price,
      unit: parsedInput.unit,
    })

    if (error) throw new Error('[APP] 서비스 추가에 실패했습니다')

    // 서비스 변경 시 번들 캐시 초기화 → 다음 견적 요청 시 AI가 새로 구성
    await invalidateBundleCache(db, profile.business_id)

    revalidatePath('/dashboard/services')
    return { success: true }
  })

// 견적폼 노출 여부 토글 액션
export const toggleShowInQuoteAction = action
  .schema(toggleShowInQuoteSchema)
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
      .update({ show_in_quote: parsedInput.show_in_quote })
      .eq('id', parsedInput.id)
      .eq('business_id', profile.business_id)

    if (error) throw new Error('[APP] 저장에 실패했습니다')

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
