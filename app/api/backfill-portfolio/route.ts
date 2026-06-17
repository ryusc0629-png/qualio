import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createPortfolioDraft } from '@/lib/actions/portfolio'

// 기존 보고서 → 포트폴리오 초안 일괄 생성 (1회성 백필 API)
// CRON_SECRET 인증 필요 — 실행 후 삭제해도 무방

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // ai_report_data가 있는 보고서 중 아직 포트폴리오가 없는 것만 조회
  const { data: reports } = await db
    .from('reports' as never)
    .select('id' as never)
    .not('ai_report_data' as never, 'is', null) as unknown as { data: { id: string }[] | null }

  if (!reports || reports.length === 0) {
    return NextResponse.json({ message: '대상 보고서 없음', processed: 0 })
  }

  let created = 0
  let skipped = 0
  let failed = 0

  for (const report of reports) {
    try {
      const result = await createPortfolioDraft(db, report.id)
      if (result) {
        created++
        console.log(`[Backfill] 포트폴리오 생성: report=${report.id} → post=${result}`)
      } else {
        skipped++
      }
    } catch (err) {
      failed++
      console.error(`[Backfill] 실패 report=${report.id}:`, err)
    }
  }

  return NextResponse.json({
    total: reports.length,
    created,
    skipped,
    failed,
  })
}
