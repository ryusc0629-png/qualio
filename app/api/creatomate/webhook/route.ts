import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { REEL_DONE, REEL_FAILED } from '@/lib/reel/queue'

interface CreatomateWebhookPayload {
  id: string
  status: 'succeeded' | 'failed'
  url?: string
}

export async function POST(req: NextRequest) {
  const payload = await req.json() as CreatomateWebhookPayload

  if (!payload.id) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = createServiceClient()

  if (payload.status === 'succeeded' && payload.url) {
    // 어느 업체 것인지 알아야 대표에게 알릴 수 있다
    const { data: report } = await db
      .from('reports')
      .update({ reel_status: REEL_DONE, reel_url: payload.url } as never)
      .eq('reel_render_id' as never, payload.id)
      .select('business_id, booking_id')
      .maybeSingle() as { data: { business_id: string; booking_id: string } | null }

    // 완성됐다고 알려주지 않으면 대표가 대시보드를 열어볼 이유가 없다.
    // 알림이 실패해도 영상은 이미 만들어졌으므로 웹훅은 성공으로 응답한다.
    if (report?.business_id) {
      try {
        const { data: booking } = await db
          .from('bookings')
          .select('customer_name')
          .eq('id', report.booking_id)
          .maybeSingle()

        const who = booking?.customer_name ? `${booking.customer_name} 현장` : '오늘 현장'
        await sendPushToBusiness(report.business_id, {
          title: '홍보 영상이 완성됐어요',
          body: `${who} 영상이 준비됐어요. 확인하고 올려보세요.`,
          url: '/dashboard/marketing',
          tag: `reel-${report.booking_id}`,
        })
      } catch (err) {
        console.error('[Creatomate] 완성 알림 실패:', err)
      }
    }
  } else if (payload.status === 'failed') {
    await db
      .from('reports')
      .update({ reel_status: REEL_FAILED } as never)
      .eq('reel_render_id' as never, payload.id)
  }

  return NextResponse.json({ ok: true })
}
