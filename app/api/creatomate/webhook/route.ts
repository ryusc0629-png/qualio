import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { REEL_DONE, REEL_FAILED } from '@/lib/reel/queue'
import { recordReelCharge } from '@/lib/reel/charges'
import { archiveReelToStorage } from '@/lib/reel/archive'
import type { SupabaseClient } from '@supabase/supabase-js'

interface CreatomateWebhookPayload {
  id: string
  status: 'succeeded' | 'failed'
  url?: string
  // 실패했을 때 이유가 여기 담겨 온다. 이름이 판마다 달라서 셋 다 받아둔다.
  error_message?: string
  errorMessage?: string
  error?: string
}

export async function POST(req: NextRequest) {
  const payload = await req.json() as CreatomateWebhookPayload

  if (!payload.id) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = createServiceClient()

  if (payload.status === 'succeeded' && payload.url) {
    // ⚠️완성 통보에는 실제로 렌더된 크기가 담겨 온다 — 요청(1080×1920)과 다르게 나오는 원인을
    //   쫓는 중이라 통째로 남긴다. 원인이 밝혀지면 지울 것.
    console.log('[Creatomate] 완성:', JSON.stringify(payload).slice(0, 800))

    // 어느 업체 것인지 알아야 대표에게 알릴 수 있다.
    // 재료는 두 곳에서 온다 — 작업보고서(reports)와 시공 사례(biz_posts).
    // 먼저 보고서에서 찾고, 없으면 시공 사례에서 찾는다.
    const { data: report } = await db
      .from('reports')
      .update({ reel_status: REEL_DONE, reel_url: payload.url, reel_error: null } as never)
      .eq('reel_render_id' as never, payload.id)
      .select('id, business_id, booking_id')
      .maybeSingle() as { data: { id: string; business_id: string; booking_id: string } | null }

    const { data: post } = report
      ? { data: null }
      : (await db
          .from('biz_posts')
          .update({ reel_status: REEL_DONE, reel_url: payload.url, reel_error: null } as never)
          .eq('reel_render_id' as never, payload.id)
          .select('id, business_id, title')
          .maybeSingle()) as { data: { id: string; business_id: string; title: string } | null }

    // 어느 쪽이든 같은 값으로 다룬다
    const hit = report
      ? { table: 'reports' as const, id: report.id, businessId: report.business_id, folderKey: report.booking_id }
      : post
        ? { table: 'biz_posts' as const, id: post.id, businessId: post.business_id, folderKey: post.id }
        : null

    // ★Creatomate는 결과물을 30일만 보관하고 지운다. 바로 우리 스토리지로 옮겨 담는다.
    //   옮기기 전에 위에서 이미 Creatomate 주소로 완료 처리를 해뒀기 때문에, 여기서
    //   실패해도 영상이 사라지진 않는다(30일 안엔 그 주소가 살아 있다).
    //   못 옮긴 건은 make-reels 크론이 매일 다시 시도한다.
    if (hit) {
      const archivedUrl = await archiveReelToStorage(db as unknown as SupabaseClient, {
        businessId: hit.businessId,
        bookingId: hit.folderKey,
        renderId: payload.id,
        sourceUrl: payload.url,
      })
      if (archivedUrl) {
        await db.from(hit.table).update({ reel_url: archivedUrl } as never).eq('id', hit.id)
      }
    }

    // 완성됐다고 알려주지 않으면 대표가 대시보드를 열어볼 이유가 없다.
    // 알림이 실패해도 영상은 이미 만들어졌으므로 웹훅은 성공으로 응답한다.
    if (hit) {
      // 완성된 편만 이용 기록에 남긴다(무료분이면 0원). 실패한 건엔 돈을 물리지 않는다.
      await recordReelCharge(db as unknown as SupabaseClient, hit.businessId, hit.id, hit.table)

      try {
        // 보고서에서 온 것은 고객 이름을, 시공 사례에서 온 것은 사례 제목을 쓴다
        let who = '오늘 현장'
        if (report) {
          const { data: booking } = await db
            .from('bookings')
            .select('customer_name')
            .eq('id', report.booking_id)
            .maybeSingle()
          if (booking?.customer_name) who = `${booking.customer_name} 현장`
        } else if (post?.title) {
          who = post.title
        }
        await sendPushToBusiness(hit.businessId, {
          title: '홍보 영상이 완성됐어요',
          body: `${who} 영상이 준비됐어요. 확인하고 올려보세요.`,
          url: '/dashboard/marketing',
          tag: `reel-${hit.folderKey}`,
        })
      } catch (err) {
        console.error('[Creatomate] 완성 알림 실패:', err)
      }
    }
  } else if (payload.status === 'failed') {
    // ⚠️이유를 버리지 말 것. 예전엔 상태만 바꿔서 화면에 "못 만들었어요"만 뜨고
    //   무엇이 문제인지 아무도 알 수 없었다(로그에도 안 남았다).
    const reason =
      payload.error_message ?? payload.errorMessage ?? payload.error ?? '알 수 없는 이유'
    console.error('[Creatomate] 렌더 실패:', payload.id, reason, JSON.stringify(payload).slice(0, 1000))

    // 실패도 두 곳 다 뒤진다 — 어느 쪽에서 온 렌더인지 모르기 때문
    for (const table of ['reports', 'biz_posts'] as const) {
      await db
        .from(table)
        .update({ reel_status: REEL_FAILED, reel_error: reason } as never)
        .eq('reel_render_id' as never, payload.id)
    }
  }

  return NextResponse.json({ ok: true })
}
