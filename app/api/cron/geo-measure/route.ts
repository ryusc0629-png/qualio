import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runGeoCheck } from '@/lib/geo/run-check'
import { sendPushToBusiness } from '@/lib/push/web-push'
import type { GeoMeasureResult } from '@/lib/geo/measure'

// Vercel Cron(daily-maintenance에서 호출): 업체별 AI 검색 노출률을 주기적으로 측정한다.
// 비용 통제를 위해 ①마지막 측정이 7일 이상 지난 업체만 ②실행당 상한(CAP)까지만 측정.
// PERPLEXITY_API_KEY가 없으면 전체를 건너뛴다(키·비용 승인 전까지 휴면 상태).

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// 실행 1회당 측정 업체 상한 — Perplexity 호출량(업체당 ~12질문)을 예측 가능하게 묶는다.
const CAP_PER_RUN = 15
// 재측정 최소 간격(일) — 노출률은 콘텐츠 누적에 따라 천천히 변하므로 주 1회로 충분.
const MIN_INTERVAL_DAYS = 7

// 마일스톤 — 이 선을 처음 넘으면 축하 푸시(높은 것 우선)
const MILESTONES = [50, 25, 10]

// 측정 직후 성장(상승·첫 인용·돌파)을 대표 폰에 푸시 — "올라가는 재미"로 리텐션.
// 하락·정체는 알리지 않는다(나쁜 소식으로 김 빼지 않음). 첫 측정은 비교 대상이 없어 조용.
async function notifyGeoGrowth(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  result: GeoMeasureResult,
): Promise<void> {
  const { data } = (await db
    .from('geo_checks' as never)
    .select('cited, share_pct' as never)
    .eq('business_id' as never, businessId)
    .order('checked_at' as never, { ascending: false })
    .limit(2)) as unknown as { data: { cited: number; share_pct: number }[] | null }

  const rows = data ?? []
  if (rows.length < 2) return // 첫 측정 — 비교 대상 없음
  const [cur, prev] = rows
  const delta = cur.share_pct - prev.share_pct
  const crossed = MILESTONES.find((m) => prev.share_pct < m && cur.share_pct >= m)

  let title: string
  let body: string
  if (prev.cited === 0 && cur.cited > 0) {
    title = '🎉 드디어 AI가 우리를 추천하기 시작했어요!'
    body = `이번 주 손님 질문 ${result.total}개 중 ${result.cited}개에서 우리 업체가 잡혔어요. 곡선이 이제 오릅니다.`
  } else if (crossed) {
    title = `🚀 AI 검색 노출률 ${crossed}% 돌파!`
    body = `이번 주 ${cur.share_pct}%까지 올라왔어요. 글이 계속 쌓이고 있어요.`
  } else if (delta > 0) {
    title = `📈 이번 주 AI 검색 노출률 +${delta}%p`
    body = `${cur.share_pct}%로 올라왔어요. 곡선이 아직 꺾이지 않았어요.`
  } else {
    return // 하락·정체는 알리지 않음
  }

  try {
    await sendPushToBusiness(businessId, { title, body, url: '/dashboard/marketing', tag: 'geo-growth' })
  } catch (err) {
    console.error(`[Cron] geo-measure 성장 푸시 실패 business=${businessId}:`, err instanceof Error ? err.message : err)
  }
}

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
      if (result) {
        measured++
        await notifyGeoGrowth(db, b.id, result) // 상승·첫인용·돌파 시 대표 폰 푸시
      } else skipped++
    } catch (err) {
      skipped++
      console.error(`[Cron] geo-measure 측정 실패 business=${b.id}:`, err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ measured, skipped, eligible: eligible.length })
}
