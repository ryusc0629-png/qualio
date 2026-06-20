'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import { sendPushToWorker } from '@/lib/push/web-push'

// 직원·도급사는 로그인 없이 토큰(workerId) 링크로 접속하므로, workerId로 본인 확인한다.
async function verifyWorker(workerId: string) {
  const db = createServiceClient() as unknown as SupabaseClient
  const { data: worker } = await db
    .from('workers')
    .select('id, business_id, is_active')
    .eq('id', workerId)
    .maybeSingle()

  const w = worker as { id: string; business_id: string; is_active: boolean } | null
  if (!w || !w.is_active) throw new Error('[APP] 접근 권한이 없어요')
  return { db, businessId: w.business_id }
}

// 직원 푸시 구독 저장 (현장 앱에서 "알림 받기"를 켰을 때)
const subscribeSchema = z.object({
  workerId: z.string().uuid(),
  endpoint: z.string().min(1),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
})

export const saveWorkerPushSubscriptionAction = action
  .schema(subscribeSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await verifyWorker(parsedInput.workerId)

    // endpoint(기기) 단위 upsert — 같은 기기에서 다시 켜면 갱신, worker_id로 소유 표시
    const { error } = await db
      .from('push_subscriptions')
      .upsert(
        {
          business_id: businessId,
          worker_id: parsedInput.workerId,
          user_id: null,
          endpoint: parsedInput.endpoint,
          p256dh: parsedInput.p256dh,
          auth: parsedInput.auth,
          user_agent: parsedInput.userAgent ?? null,
        },
        { onConflict: 'endpoint' },
      )

    if (error) {
      console.error('[FieldPush] 직원 구독 저장 실패:', error)
      throw new Error('[APP] 알림 설정을 저장하지 못했어요. 다시 시도해주세요')
    }
    return { success: true }
  })

// 직원 푸시 구독 해지 (알림을 껐을 때)
const unsubscribeSchema = z.object({
  workerId: z.string().uuid(),
  endpoint: z.string().min(1),
})

export const deleteWorkerPushSubscriptionAction = action
  .schema(unsubscribeSchema)
  .action(async ({ parsedInput }) => {
    const { db } = await verifyWorker(parsedInput.workerId)
    await db
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', parsedInput.endpoint)
      .eq('worker_id', parsedInput.workerId)
    return { success: true }
  })

// 테스트 알림 (현장 앱에서 "테스트 알림" 버튼)
export const sendWorkerTestPushAction = action
  .schema(z.object({ workerId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    await verifyWorker(parsedInput.workerId)
    await sendPushToWorker(parsedInput.workerId, {
      title: '퀄리오 알림 테스트',
      body: '알림이 잘 도착했어요! 이제 처리할 일이 생기면 여기로 알려드릴게요.',
      url: `/field/${parsedInput.workerId}`,
      tag: 'test',
    })
    return { success: true }
  })
