import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SolapiMessageService } from 'solapi'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'

// Vercel Cron(daily-maintenance에서 호출):
// 현장에서 올리고 대표가 승인한 '다음에 제안할 서비스'의 날짜가 되면 고객에게 광고 문자를 보낸다.
//
// ⚠️ 자동 발송의 법적 조건 (정보통신망법 제50조)
//   영리목적 광고성 정보는 원칙적으로 '사전 동의'가 있어야 보낼 수 있다.
//   예외는 하나뿐이다 — 거래를 통해 직접 연락처를 받은 자가 '거래 종료 후 6개월 이내'에
//   같은 종류의 재화를 권유하는 경우.
//   그래서 여기서는 다음 중 하나일 때만 문자를 보낸다:
//     (1) 고객이 광고 수신에 동의했거나(customers.marketing_consent_at)
//     (2) 마지막 작업일로부터 6개월이 지나지 않았거나
//   둘 다 아니면 문자를 보내지 않고 검토 대기로 되돌려 사장님이 직접 연락하게 한다.
//   수신거부한 번호(marketing_optouts)는 어떤 경우에도 보내지 않는다.
//
// ⚠️ 야간(21시~08시) 광고 전송은 금지다. 이 크론은 daily-maintenance(오전)에서만 돈다.

export const dynamic = 'force-dynamic'

/** 거래 종료 후 이 기간까지는 사전 동의 없이도 같은 업종 권유가 허용된다 */
const CONSENT_FREE_MONTHS = 6

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const looseDb = db as unknown as SupabaseClient
  const now = new Date()

  const { data: due } = (await looseDb
    .from('reengagement_dispatches')
    .select('id, business_id, customer_id, customer_phone, customer_name, service_name, message, last_serviced_at')
    .eq('status', 'scheduled')
    .lte('due_at', now.toISOString())
    .limit(200)) as unknown as {
    data:
      | Array<{
          id: string
          business_id: string
          customer_id: string | null
          customer_phone: string
          customer_name: string | null
          service_name: string | null
          message: string
          last_serviced_at: string | null
        }>
      | null
  }

  if (!due || due.length === 0) return NextResponse.json({ sent: 0, held: 0 })

  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET
  const sender = process.env.SOLAPI_SENDER_PHONE
  const canSend = !!(apiKey && apiSecret && sender)
  const service = canSend ? new SolapiMessageService(apiKey!, apiSecret!) : null

  let sent = 0
  let held = 0
  const heldByBusiness = new Map<string, number>()

  for (const row of due) {
    const phone = row.customer_phone.replace(/[^0-9]/g, '')

    try {
      // 1) 수신거부 — 무조건 멈춘다
      const { data: optout } = (await looseDb
        .from('marketing_optouts')
        .select('id')
        .eq('business_id', row.business_id)
        .eq('phone', phone)
        .maybeSingle()) as unknown as { data: { id: string } | null }

      if (optout) {
        await looseDb
          .from('reengagement_dispatches')
          .update({ status: 'skipped', fail_reason: '고객이 수신거부했어요' })
          .eq('id', row.id)
        continue
      }

      // 2) 자동 발송 자격
      let consented = false
      if (row.customer_id) {
        const { data: cust } = (await looseDb
          .from('customers')
          .select('marketing_consent_at')
          .eq('id', row.customer_id)
          .maybeSingle()) as unknown as { data: { marketing_consent_at: string | null } | null }
        consented = !!cust?.marketing_consent_at
      }

      const withinWindow = row.last_serviced_at
        ? now.getTime() - new Date(row.last_serviced_at).getTime() <
          CONSENT_FREE_MONTHS * 30 * 24 * 60 * 60 * 1000
        : false

      if (!consented && !withinWindow) {
        // 법으로 자동 발송이 막힌 건 — 검토 대기로 되돌려 사장님이 직접 연락하게 한다
        await looseDb
          .from('reengagement_dispatches')
          .update({
            status: 'pending',
            fail_reason: '마지막 작업 후 6개월이 지나 자동 문자를 보낼 수 없어요. 전화나 카톡으로 직접 연락해주세요',
          })
          .eq('id', row.id)
        held++
        heldByBusiness.set(row.business_id, (heldByBusiness.get(row.business_id) ?? 0) + 1)
        continue
      }

      if (!service || !sender) {
        console.error('[Cron] suggestion-followup: Solapi 미설정 — 발송 보류')
        held++
        continue
      }

      await service.sendOne({
        to: phone,
        from: sender,
        type: 'LMS',
        subject: `${row.service_name ?? '서비스'} 안내`,
        text: row.message,
      })

      await looseDb
        .from('reengagement_dispatches')
        .update({ status: 'sent', sent_at: new Date().toISOString(), fail_reason: null })
        .eq('id', row.id)

      // 같은 고객에게 90일 자동 대기열이 또 붙지 않게 이력을 남긴다
      if (row.customer_id) {
        await looseDb
          .from('customers')
          .update({ reengagement_sent_at: new Date().toISOString() })
          .eq('id', row.customer_id)
      }

      sent++
    } catch (e) {
      console.error('[Cron] suggestion-followup 발송 실패:', row.id, e)
      await looseDb
        .from('reengagement_dispatches')
        .update({ status: 'failed', fail_reason: '문자 발송에 실패했어요' })
        .eq('id', row.id)
    }
  }

  // 직접 연락해야 하는 건이 생긴 업체에만 알린다
  for (const [businessId, count] of heldByBusiness) {
    try {
      await sendPushToBusiness(businessId, {
        title: '직접 연락드릴 곳이 있어요 📞',
        body: `${count}곳은 자동 문자를 보낼 수 없어요. 목록에서 문구를 복사해 연락해주세요`,
        url: '/dashboard/reengagement',
        tag: 'suggestion-followup',
      })
    } catch (e) {
      console.error('[Cron] suggestion-followup 푸시 실패:', businessId, e)
    }
  }

  console.log(`[Cron] suggestion-followup — 발송 ${sent}건 / 보류 ${held}건`)
  return NextResponse.json({ sent, held })
}
