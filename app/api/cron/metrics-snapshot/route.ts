import { NextRequest, NextResponse } from 'next/server'
import { captureMonthlySnapshot } from '@/lib/admin/snapshot'

// Vercel Cron: daily-maintenance 가 매일 호출.
// 현재 월 지표 스냅샷을 적재해 NRR/코호트 리텐션의 시계열 데이터를 쌓는다.
// (별도 cron 등록 아님 — Hobby 2개 제한 회피. daily-maintenance 의 하위 작업)
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await captureMonthlySnapshot()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류'
    console.error('[Cron] metrics-snapshot 실패:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
