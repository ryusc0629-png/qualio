import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Vercel Cron: pending 상태에서 48시간이 지난 견적을 expired로 일괄 변경한다.
//
// ⚠️ 여기에 '내일 방문' 리마인더 알림톡을 다시 넣지 말 것.
// 예전엔 이 라우트에도 똑같은 리마인더 발송 코드가 들어 있었는데,
// daily-maintenance가 expire-quotes와 remind를 동시에 호출하는 구조라
// remind가 발송 기록(reminder_sent_at)을 남기기 전에 여기서도 같은 예약을 읽어
// 고객이 같은 안내를 2통 받았다(2026-08-18 실제 발생).
// 리마인더는 /api/cron/remind 한 곳만 담당한다.

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // 1) 만료 처리
  const expiryThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: expiredData, error: expireError } = await db
    .from('quotes')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('created_at', expiryThreshold)
    .select('id')

  if (expireError) {
    console.error('[Cron] expire-quotes 실패:', expireError)
    return NextResponse.json({ error: expireError.message }, { status: 500 })
  }
  const expired = expiredData?.length ?? 0
  console.log(`[Cron] expire-quotes 완료: ${expired}건 만료 처리`)

  return NextResponse.json({ expired })
}
