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

// 실행 1회당 측정 업체 상한 — 호출량(업체당 질문 30개 × 엔진 3개 = 90번)을 예측 가능하게 묶는다.
const CAP_PER_RUN = 15
// 재측정 최소 간격(일) — 자동 측정은 달에 한 번.
//
// 왜 주 1회에서 내렸나: 질문을 12개에서 30개로 넓히면서 측정 1회 호출이 36번 → 90번이 됐다.
// 노출률은 글이 쌓이는 속도만큼만 움직여서 주 단위로 볼 만한 변화가 없는데 비용은 4배가 된다.
// 그때그때 확인이 필요하면 화면의 '다시 측정하기'로 언제든 잴 수 있다.
const MIN_INTERVAL_DAYS = 30

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

  // 측정 엔진 키(Perplexity·Gemini·OpenAI) 하나도 없으면 휴면 — 키·비용 승인 후 자동 활성화
  if (!process.env.PERPLEXITY_API_KEY && !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ skipped: 'no-key', measured: 0 })
  }

  const db = createServiceClient()

  // 측정 대상 후보 — 업체명만 있으면 넣는다.
  //
  // 예전엔 slug와 주소를 둘 다 요구해 32곳 중 10곳만 측정됐고, 나머지는 AI 검색 화면이
  // 영영 빈 채로 남았다. 지역이 없으면 지역 검색어는 못 만들지만(지어낼 수 없다)
  // "우리 이름으로 물으면 AI가 답하나?"는 지역 없이도 측정되고, 그 결과 하나가
  // 지역·서비스를 채울 이유가 된다. 질문 세트가 비는 업체는 runGeoCheck가 알아서 건너뛴다.
  const { data: businesses } = (await db
    .from('businesses')
    .select('id, name' as never)) as unknown as {
    data: { id: string; name: string | null }[] | null
  }

  const named = (businesses ?? []).filter((b) => (b.name?.trim().length ?? 0) >= 2)
  if (named.length === 0) {
    return NextResponse.json({ measured: 0, skipped: 0, eligible: 0 })
  }

  // ★발행한 글이 한 편도 없는 업체는 재지 않는다.
  //
  // 왜: AI 검색은 '읽을 글'이 있어야 인용한다. 글이 0편인 업체를 재면 결과가 언제나 0%다.
  // 그건 측정이 아니라 돈만 쓰는 일이고, 화면에 0%만 계속 뜨면 사장님이 이 기능을 안 믿게 된다.
  // (2026-08-21 기준 32곳 중 14곳이 이 상태였다 — 절반 가까이를 헛되이 재고 있었다)
  //
  // ⚠️원가도 크다: 측정 1회가 업체당 1,609원(30문항 × 3엔진 = 90회 호출)이고
  //   사용량과 무관한 고정비라, 제품을 안 쓰는 업체일수록 원가에서 차지하는 비중이 커진다.
  //
  // ⛔조건을 '글 1편'보다 높이지 말 것 — 이제 막 시작한 업체가 첫 성과를 못 보게 된다.
  const { data: published } = (await db
    .from('biz_posts')
    .select('business_id')
    .eq('published', true)) as { data: { business_id: string }[] | null }

  const hasContent = new Set((published ?? []).map((r) => r.business_id))
  const candidates = named.filter((b) => hasContent.has(b.id))
  const noContent = named.length - candidates.length

  if (candidates.length === 0) {
    return NextResponse.json({ measured: 0, skipped: 0, eligible: 0, noContent })
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

  // noContent = 글이 없어 아예 재지 않은 업체 수(원가를 얼마나 아꼈는지 추적용)
  return NextResponse.json({ measured, skipped, eligible: eligible.length, noContent })
}
