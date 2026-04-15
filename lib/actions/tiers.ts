'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { recommendBundles } from '@/lib/ai/bundle-recommendation'
import { revalidatePath } from 'next/cache'

// 티어 번들 저장 스키마
const saveTierBundleSchema = z.object({
  bundles: z.array(
    z.object({
      tier_id: z.string().uuid(),
      service_ids: z.array(z.string().uuid()),
    })
  ),
})

// 티어별 서비스 번들 저장 (기존 연결 교체)
export const saveTierBundleAction = action
  .schema(saveTierBundleSchema)
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

    // 본인 업체 tier인지 확인
    const tierIds = parsedInput.bundles.map((b) => b.tier_id)
    const { data: tiers } = await db
      .from('quote_tiers')
      .select('id')
      .eq('business_id', profile.business_id)
      .in('id', tierIds)

    if (!tiers || tiers.length !== tierIds.length) {
      throw new Error('[APP] 올바르지 않은 티어 정보입니다')
    }

    // 기존 연결 삭제 후 새로 삽입
    for (const bundle of parsedInput.bundles) {
      await db
        .from('quote_tier_services')
        .delete()
        .eq('tier_id', bundle.tier_id)

      if (bundle.service_ids.length > 0) {
        const rows = bundle.service_ids.map((sid, idx) => ({
          tier_id: bundle.tier_id,
          service_id: sid,
          sort_order: idx,
        }))
        const { error } = await db.from('quote_tier_services').insert(rows)
        if (error) throw new Error('[APP] 번들 저장에 실패했습니다')
      }
    }

    revalidatePath('/dashboard/tiers')
    return { success: true }
  })

// AI 번들 추천 스키마
const aiSuggestBundleSchema = z.object({
  // 비어있음 — business_id는 세션에서 자동 조회
})

// AI 번들 추천 액션
export const aiSuggestBundleAction = action
  .schema(aiSuggestBundleSchema)
  .action(async () => {
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

    // 활성화된 서비스 목록 조회
    const { data: services } = await db
      .from('service_items')
      .select('id, name, base_price, unit, category')
      .eq('business_id', profile.business_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .order('created_at')

    if (!services || services.length < 2) {
      throw new Error('[APP] AI 추천을 받으려면 서비스를 2개 이상 등록해주세요')
    }

    const recommendation = await recommendBundles(services)
    return recommendation
  })
