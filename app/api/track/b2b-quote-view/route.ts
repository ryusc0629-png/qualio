import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { isBusinessInsiderViewing } from '@/lib/utils/track-page-view'

// B2B 견적서/시방서 공개 링크 조회 기록 — 고객 공개 페이지에서 호출(인증 없음)
// 추적 실패가 고객 열람을 막지 않도록 항상 가볍게 응답

interface Body {
  token?: string
}

export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as Body
    if (!token) return NextResponse.json({ ok: false }, { status: 400 })

    const db = createServiceClient()

    // public_token·view_count 등은 마이그레이션으로 추가된 새 컬럼 → 단언 사용
    const { data: quote } = await db
      .from('b2b_quotes')
      .select('id, business_id, lead_id, quote_number, view_count, first_viewed_at, view_alert_sent_at' as never)
      .eq('public_token' as never, token)
      .maybeSingle() as unknown as {
        data: {
          id: string
          business_id: string
          lead_id: string
          quote_number: string | null
          view_count: number
          first_viewed_at: string | null
          view_alert_sent_at: string | null
        } | null
      }

    if (!quote) return NextResponse.json({ ok: false }, { status: 404 })

    // 로그인한 업체 주인이 자기 견적서를 미리보는 경우는 조회수/알림에서 제외
    if (await isBusinessInsiderViewing(db, quote.business_id)) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const now = new Date().toISOString()
    const newCount = (quote.view_count ?? 0) + 1

    await db
      .from('b2b_quotes')
      .update({
        view_count: newCount,
        last_viewed_at: now,
        first_viewed_at: quote.first_viewed_at ?? now,
      } as never)
      .eq('id', quote.id)

    // 재열람(2번째 이상 열람) = 강한 구매 신호 → 대표에게 핫리드 푸시. 견적당 1회만.
    if (newCount >= 2 && !quote.view_alert_sent_at) {
      await notifyRevisited(db, quote.id, quote.business_id, quote.lead_id, quote.quote_number)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[B2bQuoteView] 조회 기록 실패:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// 고객이 견적서/시방서를 다시 열람했을 때만 대표에게 푸시.
//  - 이미 계약(contracted)·보관(archived)된 리드는 제외
//  - 견적당 1회만 (view_alert_sent_at 으로 중복 차단, 먼저 마킹 후 발송)
async function notifyRevisited(
  db: ReturnType<typeof createServiceClient>,
  quoteId: string,
  businessId: string,
  leadId: string,
  quoteNumber: string | null,
): Promise<void> {
  try {
    const { data: lead } = await db
      .from('leads')
      .select('company_name, status')
      .eq('id', leadId)
      .maybeSingle()

    // 이미 계약 성사·보관된 거래처는 알릴 필요 없음
    if (lead && (lead.status === 'contracted' || lead.status === 'archived')) return

    // 먼저 발송 표시(동시 호출 중복 방지) 후 푸시
    await db
      .from('b2b_quotes')
      .update({ view_alert_sent_at: new Date().toISOString() } as never)
      .eq('id', quoteId)

    const name = lead?.company_name ?? '고객'
    await sendPushToBusiness(businessId, {
      title: '👀 견적서를 다시 보고 있어요',
      body: `${name}이(가) 보낸 견적서·시방서를 다시 확인 중이에요 — 지금 연락하면 계약으로 이어질 수 있어요`,
      url: `/dashboard/pipeline/${leadId}`,
      tag: `b2b-quote-revisit-${quoteId}`,
    })
  } catch (err) {
    console.error('[B2bQuoteView] 재열람 푸시 실패:', err)
  }
}
