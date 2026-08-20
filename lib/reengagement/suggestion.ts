import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDate } from '@/lib/format/datetime'
import { createOptOutToken } from '@/lib/reengagement/optout-token'

// 현장에서 올린 '다음에 제안할 서비스'를 재방문 대기열에 반영하고,
// 그때 나갈 문자 초안을 만든다.
//
// 왜 문자인가:
//   알림톡으로는 영구히 못 보낸다(2026-08-16 카카오 반려 — 재방문 유도는 광고성).
//   남은 길은 광고 문자뿐이고, 광고 문자는 정보통신망법 제50조에 따라
//   (광고) 표기 · 전송자 · 무료 수신거부 방법을 반드시 함께 적어야 한다.
//   그 형식을 여기 한 곳에서만 만든다 — 화면마다 문구를 새로 짜면 빠뜨린다.

/** 광고 문자 한 통. 표기 3종은 여기서 항상 붙는다. */
export function buildSuggestionMessage(p: {
  businessName: string
  customerName: string
  serviceName: string
  reason?: string | null
  lastServicedAt?: string | null
  optOutUrl: string
}): string {
  const when = p.lastServicedAt ? formatDate(p.lastServicedAt, { year: 'numeric', month: 'long' }) : null
  const reason = (p.reason ?? '').trim().slice(0, 200)

  const lines = [
    `(광고) ${p.businessName}`,
    '',
    `${p.customerName}님, 안녕하세요.`,
    when
      ? `${when}에 작업하며 살펴본 내용으로 안내드립니다.`
      : '지난 작업 때 살펴본 내용으로 안내드립니다.',
  ]

  if (reason) lines.push('', reason)

  lines.push(
    '',
    `이제 ${p.serviceName} 하실 때가 된 것 같아 연락드렸어요.`,
    '필요하시면 편하게 연락 주세요.',
    '',
    `무료수신거부 ${p.optOutUrl}`,
  )

  return lines.join('\n')
}

/**
 * 보고서 하나에 달린 현장 제안을 목록과 똑같이 맞춘다.
 *
 * - 목록에서 빠진 것: 아직 안 나간 건(pending·scheduled)만 지운다. 이미 보낸 기록은 남긴다.
 * - 새로 들어온 것: 검토 대기(pending)로 넣는다. 실제 발송은 대표 승인 뒤 due_at에.
 * - months가 0이거나 목록이 비면 전부 정리된다.
 */
export async function syncFieldSuggestions(opts: {
  db: SupabaseClient
  businessId: string
  bookingId: string
  reportId: string
  workerId: string | null
  serviceNames: string[]
  reason: string | null
  dueAt: string | null
}): Promise<number> {
  const { db, businessId, bookingId, reportId, workerId, reason, dueAt } = opts
  // 시점을 '안 함'으로 두면 연락할 방법이 없으므로 제안도 만들지 않는다
  const names = dueAt ? [...new Set(opts.serviceNames.map((s) => s.trim()).filter(Boolean))] : []

  const { data: existing } = (await db
    .from('reengagement_dispatches')
    .select('id, service_name, status')
    .eq('business_id', businessId)
    .eq('report_id', reportId)) as unknown as {
      data: Array<{ id: string; service_name: string | null; status: string }> | null
    }

  const rows = existing ?? []

  // 빠진 것 정리 — 이미 나간 건은 건드리지 않는다
  const staleIds = rows
    .filter((r) => ['pending', 'scheduled'].includes(r.status))
    .filter((r) => !r.service_name || !names.includes(r.service_name))
    .map((r) => r.id)
  if (staleIds.length > 0) {
    await db.from('reengagement_dispatches').delete().in('id', staleIds)
  }

  const kept = new Set(rows.map((r) => r.service_name).filter(Boolean) as string[])
  const toAdd = names.filter((n) => !kept.has(n))
  if (toAdd.length === 0) return 0

  // 고객·업체 정보 — 문자 문구에 들어간다
  const { data: booking } = (await db
    .from('bookings')
    .select('customer_name, customer_phone, customer_id, scheduled_at, businesses!business_id(name)')
    .eq('id', bookingId)
    .maybeSingle()) as unknown as {
      data: {
        customer_name: string | null
        customer_phone: string | null
        customer_id: string | null
        scheduled_at: string
        businesses: { name: string } | { name: string }[] | null
      } | null
    }

  if (!booking?.customer_phone) return 0 // 연락처가 없으면 보낼 방법이 없다

  const biz = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
  const businessName = biz?.name ?? '저희 업체'
  const customerName = booking.customer_name ?? '고객'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  const optOutToken = createOptOutToken(businessId, booking.customer_phone)
  const optOutUrl = optOutToken ? `${appUrl}/unsubscribe/${optOutToken}` : `${appUrl}/unsubscribe`

  const inserts = toAdd.map((serviceName) => ({
    business_id:      businessId,
    customer_id:      booking.customer_id,
    customer_phone:   booking.customer_phone,
    customer_name:    customerName,
    last_booking_id:  bookingId,
    last_serviced_at: booking.scheduled_at,
    report_id:        reportId,
    worker_id:        workerId,
    source:           'field',
    service_name:     serviceName,
    reason,
    due_at:           dueAt,
    status:           'pending',
    channel:          'sms',
    message: buildSuggestionMessage({
      businessName,
      customerName,
      serviceName,
      reason,
      lastServicedAt: booking.scheduled_at,
      optOutUrl,
    }),
  }))

  const { error } = await db.from('reengagement_dispatches').insert(inserts)
  if (error) {
    console.error('[Suggestion] 대기열 저장 실패:', error)
    return 0
  }
  return inserts.length
}
