import 'server-only'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

// VAPID 설정 — 환경변수 없으면 발송을 건너뛴다 (로컬/미설정 환경 보호)
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY

let vapidReady = false
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:ryusc0629@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
  vapidReady = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string // 알림 클릭 시 이동할 경로 (기본 /dashboard)
  tag?: string // 같은 tag면 알림이 쌓이지 않고 갱신
}

interface SubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * 한 업체(대표)의 모든 기기에 푸시 발송.
 * 만료/해지된 구독(404·410)은 자동으로 DB에서 정리한다.
 * 발송 자체가 실패해도 호출부(예약/견적 생성 등)는 막지 않는다 — 알림은 부가 기능.
 */
export async function sendPushToBusiness(businessId: string, payload: PushPayload): Promise<void> {
  if (!vapidReady) {
    console.error('[Push] VAPID 키가 설정되지 않아 발송을 건너뜁니다')
    return
  }

  // push_subscriptions는 아직 database.ts 타입에 없어 느슨한 클라이언트로 접근
  const db = createServiceClient() as unknown as SupabaseClient
  const { data, error } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('business_id', businessId)

  if (error) {
    console.error('[Push] 구독 조회 실패:', error)
    return
  }

  const subs = (data ?? []) as SubscriptionRow[]
  if (subs.length === 0) return

  const body = JSON.stringify(payload)

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        )
      } catch (e) {
        const statusCode = (e as { statusCode?: number }).statusCode
        // 404/410 = 구독 만료·해지 → DB에서 제거
        if (statusCode === 404 || statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        } else {
          console.error('[Push] 발송 실패:', statusCode, e)
        }
      }
    }),
  )
}
