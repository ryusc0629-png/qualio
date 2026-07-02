import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { isBusinessInsiderViewing } from '@/lib/utils/track-page-view'
import { normalizeChannel } from '@/lib/utils/marketing-channels'

// 견적 퍼널 이벤트 기록 — 고객 공개 페이지에서 호출(인증 없음)
// 추적 실패가 고객 경험을 막지 않도록 항상 200/4xx로 가볍게 응답

const ALLOWED_EVENTS = [
  'form_started',
  'step_completed',
  'quote_submitted',
  'quote_viewed',
  'plan_selected',
  'address_entered',
  'booking_submitted',
]

interface FunnelBody {
  businessId?: string
  sessionId?: string
  event?: string
  step?: string
  meta?: Record<string, string | number>
  channel?: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as FunnelBody
    const { businessId, sessionId, event, step, meta, channel } = body

    if (!businessId || !sessionId || !event || !ALLOWED_EVENTS.includes(event)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const db = createServiceClient()

    // 로그인한 업체 주인이 자기 견적폼을 테스트하는 경우는 퍼널 통계에서 제외
    // (sendBeacon은 같은 출처 쿠키를 함께 보내므로 서버에서 로그인 세션 확인 가능)
    if (await isBusinessInsiderViewing(db, businessId)) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    // quote_funnel_events 타입이 database.ts에 아직 없어 단언 사용
    await db.from('quote_funnel_events' as never).insert({
      business_id: businessId,
      session_id: sessionId,
      event_type: event,
      step: step ?? null,
      meta: meta && typeof meta === 'object' ? meta : {},
      channel: normalizeChannel(channel),
    } as never)

    // Jobber/HCP 방식 — 고객이 견적서를 "다시 열람"하면 대표에게 핫리드 푸시
    // (가장 뜨거운 구매 신호 → 지금 연락하면 잡을 수 있음). 견적당 1회만.
    if (event === 'quote_viewed' && typeof meta?.quoteId === 'string') {
      await notifyQuoteRevisited(db, businessId, meta.quoteId)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[FunnelTrack] 퍼널 이벤트 기록 실패:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// 고객이 견적서를 "다시" 열람했을 때만 대표에게 푸시.
// 소음 방지 규칙:
//  - 아직 예약 안 된(pending) 견적만
//  - 생성 30분 이내(=신청 직후 자동 열람)는 제외 — 대표는 이미 '새 견적' 푸시를 받음
//  - 견적당 1회만 (view_alert_sent_at 으로 중복 차단)
async function notifyQuoteRevisited(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  quoteId: string,
): Promise<void> {
  try {
    const { data: quote } = await db
      .from('quotes')
      .select('id, business_id, customer_name, cleaning_type, status, created_at, view_alert_sent_at' as never)
      .eq('id', quoteId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as {
        data: {
          id: string; business_id: string; customer_name: string | null
          cleaning_type: string | null; status: string
          created_at: string; view_alert_sent_at: string | null
        } | null
      }

    if (!quote || quote.status !== 'pending' || quote.view_alert_sent_at) return

    const ageMin = (Date.now() - new Date(quote.created_at).getTime()) / 60000
    if (ageMin < 30) return // 신청 직후 자동 열람은 제외

    // 먼저 발송 표시(동시 호출 중복 방지) 후 푸시
    await db
      .from('quotes')
      .update({ view_alert_sent_at: new Date().toISOString() } as never)
      .eq('id', quoteId)

    const name = quote.customer_name ?? '고객'
    await sendPushToBusiness(businessId, {
      title: '👀 견적서를 다시 보고 있어요',
      body: `${name}님이 ${quote.cleaning_type ?? '견적'}을 다시 확인 중이에요 — 지금 연락하면 예약으로 이어질 수 있어요`,
      url: '/dashboard/clients?type=individual',
      tag: `quote-revisit-${quoteId}`,
    })
  } catch (err) {
    console.error('[FunnelTrack] 견적 재열람 푸시 실패:', err)
  }
}
