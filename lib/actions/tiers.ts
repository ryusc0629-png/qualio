'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { recommendBundles } from '@/lib/ai/bundle-recommendation'
import { revalidatePath } from 'next/cache'

// 티어 번들 저장 스키마 — 서비스 구성 + 플랜 메타(이름·설명·추천)를 함께 저장
const saveTierBundleSchema = z.object({
  // 추천(highlight)으로 강조할 플랜 1개 (없으면 null)
  highlightTierId: z.string().uuid().nullable(),
  bundles: z.array(
    z.object({
      tier_id: z.string().uuid(),
      label: z.string().trim().min(1, '플랜 이름을 입력해주세요').max(20, '플랜 이름이 너무 깁니다'),
      description: z.string().trim().max(100, '설명이 너무 깁니다'),
      service_ids: z.array(z.string().uuid()),
    })
  ),
})

// 티어별 서비스 번들 + 플랜 메타 저장 (기존 연결 교체)
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

    for (const bundle of parsedInput.bundles) {
      // 1) 플랜 메타(이름·설명·추천 배지) 갱신
      const { error: metaError } = await db
        .from('quote_tiers')
        .update({
          label: bundle.label,
          description: bundle.description || null,
          highlight: bundle.tier_id === parsedInput.highlightTierId,
        })
        .eq('id', bundle.tier_id)
        .eq('business_id', profile.business_id)
      if (metaError) throw new Error('[APP] 플랜 정보 저장에 실패했습니다')

      // 2) 서비스 연결 교체 (기존 삭제 후 새로 삽입)
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
      throw new Error('[APP] 추천을 받으려면 서비스를 2개 이상 등록해주세요')
    }

    const recommendation = await recommendBundles(services)
    return recommendation
  })
