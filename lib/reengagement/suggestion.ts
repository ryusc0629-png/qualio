import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDate } from '@/lib/format/datetime'
import { formatPhone } from '@/lib/format/phone'
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
  businessPhone?: string | null
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

  lines.push('', `이제 ${p.serviceName} 하실 때가 된 것 같아 연락드렸어요.`)

  // 발신번호는 퀄리오 번호라 답장이 업체에 닿지 않는다.
  // 업체 번호를 본문에 적어 손님이 '전화'로 오게 한다 — 이 한 줄이 없으면 문의가 증발한다.
  if (p.businessPhone) {
    // 업체 정보에 하이픈 없이 저장된 번호가 많다. 그대로 쓰면 01029122881처럼 붙어 나와
    // 손님이 한눈에 못 읽는다 — 보이는 곳에서는 항상 하이픈을 넣는다.
    lines.push(`문의는 ${formatPhone(p.businessPhone)}로 전화 주세요. (이 번호로 답장은 받지 못해요)`)
  } else {
    lines.push('필요하시면 편하게 연락 주세요.')
  }

  lines.push('', `무료수신거부 ${p.optOutUrl}`)

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
    .select('id, service_name, status, reason, approved_at')
    .eq('business_id', businessId)
    .eq('report_id', reportId)) as unknown as {
      data: Array<{
        id: string
        service_name: string | null
        status: string
        reason: string | null
        approved_at: string | null
      }> | null
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

  // 현장이 문장을 고쳐 다시 저장하면 대기열 문구도 따라가야 한다.
  // 아직 사장님이 승인하지 않은 건만 갈아끼운다 — 승인 때 손본 문구를 덮으면 안 된다.
  const toRefresh = rows.filter(
    (r) =>
      r.status === 'pending' &&
      !r.approved_at &&
      r.service_name &&
      names.includes(r.service_name) &&
      (r.reason ?? '') !== (reason ?? ''),
  )

  if (toAdd.length === 0 && toRefresh.length === 0) return 0

  // 고객·업체 정보 — 문자 문구에 들어간다
  const { data: booking } = (await db
    .from('bookings')
    .select('customer_name, customer_phone, customer_id, scheduled_at, businesses!business_id(name, phone)')
    .eq('id', bookingId)
    .maybeSingle()) as unknown as {
      data: {
        customer_name: string | null
        customer_phone: string | null
        customer_id: string | null
        scheduled_at: string
        businesses: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null
      } | null
    }

  if (!booking?.customer_phone) return 0 // 연락처가 없으면 보낼 방법이 없다

  const biz = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
  const businessName = biz?.name ?? '저희 업체'
  const businessPhone = biz?.phone ?? null
  const customerName = booking.customer_name ?? '고객'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  const optOutToken = createOptOutToken(businessId, booking.customer_phone)
  const optOutUrl = optOutToken ? `${appUrl}/unsubscribe/${optOutToken}` : `${appUrl}/unsubscribe`

  const messageFor = (serviceName: string) =>
    buildSuggestionMessage({
      businessName,
      businessPhone,
      customerName,
      serviceName,
      reason,
      lastServicedAt: booking.scheduled_at,
      optOutUrl,
    })

  // 문장이 바뀐 건은 근거와 문구를 함께 갈아끼운다. 근거만 고치면 문자에 옛 문장이 그대로 나간다.
  for (const r of toRefresh) {
    await db
      .from('reengagement_dispatches')
      .update({ reason, message: messageFor(r.service_name!) })
      .eq('id', r.id)
  }

  if (toAdd.length === 0) return 0

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
    message:          messageFor(serviceName),
  }))

  const { error } = await db.from('reengagement_dispatches').insert(inserts)
  if (error) {
    console.error('[Suggestion] 대기열 저장 실패:', error)
    return 0
  }
  return inserts.length
}
