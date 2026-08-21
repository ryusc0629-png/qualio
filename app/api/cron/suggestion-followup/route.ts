import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SolapiMessageService } from 'solapi'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { canSendMarketingSms } from '@/lib/reengagement/consent'

// Vercel Cron(daily-maintenance에서 호출):
// 현장에서 올리고 대표가 승인한 '다음에 제안할 서비스'의 날짜가 되면 고객에게 광고 문자를 보낸다.
//
// ★ 문자는 '받아보겠다고 고른 손님'에게만 나간다.
//
//   법(정보통신망법 제50조)은 '거래 종료 후 6개월 이내'라면 동의 없이도 같은 업종 권유를
//   허용하지만, 우리는 그 예외를 쓰지 않는다. 견적 폼에 "동의하지 않으시면 광고 문자는
//   보내지 않습니다"라고 손님에게 약속하고 번호를 받았기 때문이다.
//   그 약속을 깨면 항의는 퀄리오가 아니라 고객사 사장님이 받는다.
//
//   동의가 없으면 문자를 보내지 않고 검토 대기로 되돌려 사장님이 직접 전화하게 한다.
//   재구매 제안은 어차피 전화가 문자보다 훨씬 잘 된다 — 손해 보는 장사가 아니다.
//   ⛔ 여기에 '6개월 이내면 그냥 보낸다'를 다시 넣지 말 것.
//
// ⚠️ 야간(21시~08시) 광고 전송은 금지다. 이 크론은 daily-maintenance(오전)에서만 돈다.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const looseDb = db as unknown as SupabaseClient
  const now = new Date()

  // 승인된 것(scheduled)만이 아니라 아직 검토 안 한 것(pending)도 함께 본다.
  // 승인을 깜빡한 제안이 그날 조용히 지나가면, 현장이 적어둔 기회가 통째로 사라진다.
  const { data: due } = (await looseDb
    .from('reengagement_dispatches')
    .select('id, business_id, status, customer_id, customer_phone, customer_name, service_name, message, notified_at')
    .eq('source', 'field')
    .in('status', ['scheduled', 'pending'])
    .lte('due_at', now.toISOString())
    .limit(200)) as unknown as {
    data:
      | Array<{
          id: string
          business_id: string
          status: string
          customer_id: string | null
          customer_phone: string
          customer_name: string | null
          service_name: string | null
          message: string
          notified_at: string | null
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
      // 아직 승인 안 한 제안 — 문자는 못 보낸다. 오늘이 그날이라는 것만 한 번 알린다.
      if (row.status === 'pending') {
        if (row.notified_at) continue // 이미 알렸다. 매일 같은 건으로 폰이 울리면 안 된다
        await looseDb
          .from('reengagement_dispatches')
          .update({
            notified_at: now.toISOString(),
            fail_reason: '오늘이 연락드리기로 한 날이에요. 전화하시거나, 문자로 보내려면 승인해주세요',
          })
          .eq('id', row.id)
        held++
        heldByBusiness.set(row.business_id, (heldByBusiness.get(row.business_id) ?? 0) + 1)
        continue
      }

      // 문자를 보내도 되는 번호인지 — 동의했고 거부한 적 없어야 한다
      const allowed = await canSendMarketingSms(looseDb, row.business_id, phone)

      if (!allowed) {
        // 문자를 못 보내는 건 — 검토 대기로 되돌려 사장님이 직접 전화하게 한다
        await looseDb
          .from('reengagement_dispatches')
          .update({
            status: 'pending',
            notified_at: now.toISOString(),
            fail_reason: '이 손님은 문자 수신에 동의하지 않으셨어요. 전화나 카톡으로 직접 연락해주세요',
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
        title: '오늘 연락드릴 곳이 있어요 📞',
        body: `${count}곳은 전화로 연락하셔야 해요. 준비된 문구를 보고 전화 한 통이면 됩니다`,
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
