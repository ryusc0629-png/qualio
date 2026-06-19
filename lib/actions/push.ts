'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import { sendPushToBusiness } from '@/lib/push/web-push'

// 공통 인증 헬퍼 — 로그인 사용자의 업체/사용자 ID + 느슨한 DB 클라이언트
async function getAuthContext() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) throw new Error('[APP] 로그인이 필요합니다')

  // push_subscriptions는 아직 database.ts 타입에 없어 느슨한 클라이언트로 접근
  const db = createServiceClient() as unknown as SupabaseClient
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  const businessId = (profile as { business_id?: string } | null)?.business_id
  if (!businessId) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')
  return { db, businessId, userId: user.id }
}

// 푸시 구독 저장 (대표가 "알림 받기"를 켰을 때)
const subscribeSchema = z.object({
  endpoint: z.string().min(1),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
})

export const savePushSubscriptionAction = action
  .schema(subscribeSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId, userId } = await getAuthContext()

    // endpoint(기기) 단위로 upsert — 같은 기기에서 다시 켜면 갱신
    const { error } = await db
      .from('push_subscriptions')
      .upsert(
        {
          business_id: businessId,
          user_id: userId,
          endpoint: parsedInput.endpoint,
          p256dh: parsedInput.p256dh,
          auth: parsedInput.auth,
          user_agent: parsedInput.userAgent ?? null,
        },
        { onConflict: 'endpoint' },
      )

    if (error) {
      console.error('[Push] 구독 저장 실패:', error)
      throw new Error('[APP] 알림 설정을 저장하지 못했어요. 다시 시도해주세요')
    }
    return { success: true }
  })

// 푸시 구독 해지 (대표가 알림을 껐을 때)
const unsubscribeSchema = z.object({ endpoint: z.string().min(1) })

export const deletePushSubscriptionAction = action
  .schema(unsubscribeSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuthContext()
    await db
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', parsedInput.endpoint)
      .eq('business_id', businessId)
    return { success: true }
  })

// 테스트 알림 보내기 (설정 화면에서 "테스트 알림" 버튼)
export const sendTestPushAction = action
  .schema(z.object({}))
  .action(async () => {
    const { businessId } = await getAuthContext()
    await sendPushToBusiness(businessId, {
      title: '퀄리오 알림 테스트',
      body: '알림이 잘 도착했어요! 이제 새 견적·일정이 생기면 여기로 알려드릴게요.',
      url: '/dashboard',
      tag: 'test',
    })
    return { success: true }
  })
