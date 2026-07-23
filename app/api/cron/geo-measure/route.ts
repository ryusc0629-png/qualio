import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runGeoCheck } from '@/lib/geo/run-check'

// Vercel Cron(daily-maintenance에서 호출): 업체별 AI 검색 노출률을 주기적으로 측정한다.
// 비용 통제를 위해 ①마지막 측정이 7일 이상 지난 업체만 ②실행당 상한(CAP)까지만 측정.
// PERPLEXITY_API_KEY가 없으면 전체를 건너뛴다(키·비용 승인 전까지 휴면 상태).

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// 실행 1회당 측정 업체 상한 — Perplexity 호출량(업체당 ~12질문)을 예측 가능하게 묶는다.
const CAP_PER_RUN = 15
// 재측정 최소 간격(일) — 노출률은 콘텐츠 누적에 따라 천천히 변하므로 주 1회로 충분.
const MIN_INTERVAL_DAYS = 7

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 측정 엔진 키 없으면 휴면 — 키·비용 승인 후 자동 활성화
  if (!process.env.PERPLEXITY_API_KEY) {
    return NextResponse.json({ skipped: 'no-key', measured: 0 })
  }

  const db = createServiceClient()

  // 측정 대상 후보 — 공개 페이지(slug)와 지역(address)이 있는 업체만(질문 생성 가능 조건)
  const { data: businesses } = (await db
    .from('businesses')
    .select('id, address' as never)
    .not('slug', 'is', null)) as unknown as {
    data: { id: string; address: string | null }[] | null
  }

  const candidates = (businesses ?? []).filter((b) => !!b.address?.trim())
  if (candidates.length === 0) {
    return NextResponse.json({ measured: 0, skipped: 0, eligible: 0 })
  }

  // 최근 MIN_INTERVAL_DAYS 내 측정 이력이 있는 업체는 제외(중복 측정 방지)
  const since = new Date(Date.now() - MIN_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = (await db
    .from('geo_checks' as never)
    .select('business_id' as never)
    .gte('checked_at' as never, since)) as unknown as { data: { business_id: string }[] | null }

  const recentlyChecked = new Set((recent ?? []).map((r) => r.business_id))
  const eligible = candidates.filter((b) => !recentlyChecked.has(b.id))

  let measured = 0
  let skipped = 0
  for (const b of eligible.slice(0, CAP_PER_RUN)) {
    try {
      const { result } = await runGeoCheck(db, b.id)
      if (result) measured++
      else skipped++
    } catch (err) {
      skipped++
      console.error(`[Cron] geo-measure 측정 실패 business=${b.id}:`, err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ measured, skipped, eligible: eligible.length })
}
