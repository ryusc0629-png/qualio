import { NextRequest, NextResponse } from 'next/server'
import { computePricingBenchmark, savePricingBenchmark } from '@/lib/benchmarks/pricing-benchmark'

// Vercel Cron: daily-maintenance 가 매일 호출.
// 객단가 상위 업체들이 실제로 쓰는 3단계 플랜 인상률·구성을 집계해 스냅샷으로 적재한다.
// → 서비스 항목 편집의 "가격 가이드"가 이 값을 읽어 자동으로 최신 기준을 보여준다.
// (별도 cron 등록 아님 — Hobby 2개 제한 회피. daily-maintenance 의 하위 작업)
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const benchmark = await computePricingBenchmark()
    await savePricingBenchmark(benchmark)
    return NextResponse.json({
      ok: true,
      sampleBiz: benchmark.sampleBiz,
      topBiz: benchmark.topBiz,
      topBetterUpliftPct: benchmark.topBetterUpliftPct,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류'
    console.error('[Cron] pricing-benchmark 실패:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
