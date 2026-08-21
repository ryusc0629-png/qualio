import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderReelForReport } from '@/lib/reel/render'
import { REEL_QUEUED } from '@/lib/reel/queue'

// 대기열에 들어온 홍보 영상을 실제로 만든다.
//
// 현장 직원이 보고서를 보내거나 작업을 끝내면 대기열에 들어가고(즉시), 실제 제작은 여기서 한다.
// 제작에는 대본 생성 + 문장별 음성 합성 + 업로드로 한 건에 20~40초가 걸려서
// 사용자 요청 안에서 할 수 없다.

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * 한 번에 만드는 최대 편수.
 *
 * 한 건에 20~40초씩 걸리고 함수 제한이 300초라, 여유를 두고 6편까지만 한다.
 * 남은 건 다음 날 다시 집힌다(대기열은 사라지지 않는다).
 */
const MAX_PER_RUN = 6

/**
 * 한 업체가 하루에 만들 수 있는 편수.
 *
 * 왜 막나: 영상 한 편에 대본·음성·렌더 비용이 든다. 하루 현장이 10곳인 업체가
 * 전부 영상이 되면 원가가 그만큼 나가는데, 대표가 그걸 다 올리지도 않는다.
 * 콘텐츠는 하루 한두 편이 가장 좋다 — 몰아서 올리면 오히려 계정 평가가 깎인다.
 */
const MAX_PER_BUSINESS = 2

interface QueuedRow {
  id: string
  business_id: string
  reel_queued_at: string | null
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const auth = request.headers.get('authorization')
  const headerSecret = request.headers.get('x-cron-secret')
  const querySecret = new URL(request.url).searchParams.get('secret')

  if (auth !== `Bearer ${secret}` && headerSecret !== secret && querySecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient() as unknown as SupabaseClient

  // 오래 기다린 것부터
  const { data: queued, error } = (await db
    .from('reports')
    .select('id, business_id, reel_queued_at')
    .eq('reel_status', REEL_QUEUED)
    .order('reel_queued_at', { ascending: true, nullsFirst: true })
    .limit(50)) as { data: QueuedRow[] | null; error: unknown }

  if (error) {
    console.error('[Cron] 홍보 영상 대기열 조회 실패:', error)
    return NextResponse.json({ error: '대기열 조회 실패' }, { status: 500 })
  }

  const rows = queued ?? []
  if (rows.length === 0) return NextResponse.json({ ok: true, made: 0, queued: 0 })

  // 업체별 상한 적용 — 한 업체가 대기열을 독차지하지 않게 한다
  const perBusiness = new Map<string, number>()
  const picked: QueuedRow[] = []
  for (const row of rows) {
    if (picked.length >= MAX_PER_RUN) break
    const used = perBusiness.get(row.business_id) ?? 0
    if (used >= MAX_PER_BUSINESS) continue
    perBusiness.set(row.business_id, used + 1)
    picked.push(row)
  }

  // 한 건씩 순서대로 — 동시에 돌리면 음성 합성이 몰려 레이트리밋에 걸린다
  let made = 0
  const failures: string[] = []
  for (const row of picked) {
    const result = await renderReelForReport(db, row.id)
    if (result.ok) made++
    else failures.push(`${row.id}: ${result.reason}`)
  }

  if (failures.length > 0) console.error('[Cron] 홍보 영상 제작 실패:', failures.join(' / '))

  return NextResponse.json({
    ok: true,
    made,
    skipped: rows.length - picked.length,
    failed: failures.length,
  })
}
