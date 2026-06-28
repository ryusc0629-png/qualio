import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendOnMyWayAlimtalk } from './alimtalk'

export interface OnMyWayResult {
  sent: boolean     // 실제로 알림톡이 나갔는지 (템플릿 미설정이면 false)
  skipped: boolean  // 고객이 수신을 꺼둬서 보내지 않았는지
}

export interface OnMyWayBooking {
  id: string
  customer_name: string
  customer_phone: string | null
  scheduled_at: string
  quote_id: string | null
}

// 한 예약에 대해 '기사 출발' 알림톡을 보낸다. 현장 앱·대시보드 양쪽 액션이 공유한다.
// - 고객이 수신을 끄면(notify_on_my_way=false) skipped=true, 발송 안 함
// - 템플릿 미설정(심사 전)이면 sent=false (조용히 생략)
// - 실제 발송 시 bookings.on_my_way_sent_at 기록
export async function sendOnMyWayForBooking(
  db: SupabaseClient,
  businessId: string,
  booking: OnMyWayBooking,
): Promise<OnMyWayResult> {
  if (!booking.customer_phone) {
    throw new Error('[APP] 고객 연락처가 없어 출발 알림을 보낼 수 없어요')
  }

  // 고객 수신 설정 — 전화번호로 조회, 고객 레코드가 없으면 기본 발송(true)
  const { data: customer } = await db
    .from('customers')
    .select('notify_on_my_way')
    .eq('business_id', businessId)
    .eq('phone', booking.customer_phone)
    .maybeSingle()
  const notify = customer
    ? (customer as { notify_on_my_way: boolean | null }).notify_on_my_way !== false
    : true
  if (!notify) return { sent: false, skipped: true }

  const { data: business } = await db
    .from('businesses')
    .select('name, phone')
    .eq('id', businessId)
    .maybeSingle()
  if (!business) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

  // 서비스명 (견적 연결된 경우)
  let cleaningType = '청소 서비스'
  if (booking.quote_id) {
    const { data: quote } = await db
      .from('quotes')
      .select('cleaning_type')
      .eq('id', booking.quote_id)
      .maybeSingle()
    if (quote && (quote as { cleaning_type: string | null }).cleaning_type) {
      cleaningType = (quote as { cleaning_type: string }).cleaning_type
    }
  }

  const biz = business as { name: string; phone: string | null }
  const sent = await sendOnMyWayAlimtalk({
    customerPhone: booking.customer_phone,
    customerName:  booking.customer_name ?? '고객',
    businessName:  biz.name,
    businessPhone: biz.phone ?? null,
    cleaningType,
    scheduledAt:   booking.scheduled_at,
  })

  if (sent) {
    await db
      .from('bookings')
      .update({ on_my_way_sent_at: new Date().toISOString() })
      .eq('id', booking.id)
  }

  return { sent, skipped: false }
}
