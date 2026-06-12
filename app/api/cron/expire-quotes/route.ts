import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Vercel Cron: 매일 01:00 UTC (한국 오전 10시) 실행
// pending 상태에서 48시간이 지난 견적을 expired로 일괄 변경
// — 고객 정보는 DB에 영구 보존, 업체 화면에서만 만료 처리됨

export async function GET(req: NextRequest) {
  // 인증 확인 (Vercel Cron 또는 CRON_SECRET 헤더)
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // 48시간 전 시각 계산
  const expiryThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('quotes')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('created_at', expiryThreshold)
    .select('id')

  if (error) {
    console.error('[Cron] expire-quotes 실패:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const count = data?.length ?? 0
  console.log(`[Cron] expire-quotes 완료: ${count}건 만료 처리`)

  return NextResponse.json({ expired: count, threshold: expiryThreshold })
}
