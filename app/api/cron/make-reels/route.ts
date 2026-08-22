import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderReelForReport, renderReelForPortfolio } from '@/lib/reel/render'
import { REEL_QUEUED, REEL_DONE } from '@/lib/reel/queue'
import { archiveReelToStorage, isArchivedUrl } from '@/lib/reel/archive'

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
  /** 어디서 온 재료인가 — 작업보고서 or 시공 사례 */
  from?: 'report' | 'portfolio'
}

interface DoneRow {
  id: string
  business_id: string
  /** 나레이션·영상을 담은 폴더 이름. 보고서는 예약 id, 시공 사례는 글 id */
  booking_id: string
  reel_render_id: string | null
  reel_url: string | null
  /** 상태를 되돌려 적을 테이블 */
  table?: 'reports' | 'biz_posts'
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

  // 오래 기다린 것부터. 재료는 두 곳에서 온다 —
  // 작업보고서(현장이 찍어 올린 것)와 시공 사례(예전에 찍어둔 것을 사장님이 올린 것).
  const [reportsRes, postsRes] = await Promise.all([
    db.from('reports')
      .select('id, business_id, reel_queued_at')
      .eq('reel_status', REEL_QUEUED)
      .order('reel_queued_at', { ascending: true, nullsFirst: true })
      .limit(50),
    db.from('biz_posts')
      .select('id, business_id, reel_queued_at')
      .eq('reel_status', REEL_QUEUED)
      .order('reel_queued_at', { ascending: true, nullsFirst: true })
      .limit(50),
  ])

  if (reportsRes.error || postsRes.error) {
    console.error('[Cron] 홍보 영상 대기열 조회 실패:', reportsRes.error ?? postsRes.error)
    return NextResponse.json({ error: '대기열 조회 실패' }, { status: 500 })
  }

  const rows: QueuedRow[] = [
    ...((reportsRes.data ?? []) as QueuedRow[]).map((r) => ({ ...r, from: 'report' as const })),
    ...((postsRes.data ?? []) as QueuedRow[]).map((r) => ({ ...r, from: 'portfolio' as const })),
  ].sort((a, b) => (a.reel_queued_at ?? '').localeCompare(b.reel_queued_at ?? ''))

  // ⚠️만들 게 없어도 '보관'은 반드시 돌려야 한다. 평소엔 대기열이 비어 있는 게 정상이라,
  //   여기서 그냥 돌아가면 30일 뒤 사라질 영상을 옮기는 일이 사실상 한 번도 안 돈다.
  if (rows.length === 0) {
    const archivedOnly = await archivePendingReels(db)
    return NextResponse.json({ ok: true, made: 0, queued: 0, archived: archivedOnly })
  }

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
    const result = row.from === 'portfolio'
      ? await renderReelForPortfolio(db, row.id)
      : await renderReelForReport(db, row.id)
    if (result.ok) {
      made++
      // 영상만 주면 사장님이 인스타에 올릴 때 캡션을 직접 써야 한다. 같이 만들어 둔다.
      // ⚠️여기서 만드는 이유: 사장님이 버튼을 누른 순간에 하면 그만큼 화면이 멈춘다.
      //   어차피 제작에 20~40초를 쓰는 자리라 여기 얹는 게 사용자에겐 공짜다.
      await ensureCaption(db, row.id, row.from ?? 'report')
    } else {
      failures.push(`${row.id}: ${result.reason}`)
    }
  }

  if (failures.length > 0) console.error('[Cron] 홍보 영상 제작 실패:', failures.join(' / '))

  const archived = await archivePendingReels(db)

  return NextResponse.json({
    ok: true,
    made,
    skipped: rows.length - picked.length,
    failed: failures.length,
    archived,
  })
}

/**
 * 영상에 붙는 채널 문구가 없으면 만들어 둔다.
 *
 * ★소스가 무엇이든 영상에는 반드시 문구가 붙어야 한다.
 * 🔴예전엔 작업보고서 영상의 문구를 '그 보고서에서 승인된 시공 사례'에서 가져왔다. 그런데
 *   사례 승인은 별개 흐름이라 대부분 안 돼 있어서, 채널 버튼이 아예 안 그려졌다(운영 확인).
 *   ⛔문구를 남의 흐름에 의존시키지 말 것.
 *
 * 여기서 만드는 이유: 사장님이 버튼을 누른 순간에 하면 그만큼 화면이 멈춘다.
 * 어차피 제작에 20~40초를 쓰는 자리라 여기 얹는 게 사용자에겐 공짜다.
 * 실패해도 영상은 그대로 나간다 — 문구는 곁들이지 영상의 조건이 아니다.
 */
async function ensureCaption(
  db: SupabaseClient,
  id: string,
  from: 'report' | 'portfolio',
): Promise<void> {
  try {
    if (from === 'portfolio') {
      const { data: post } = (await db
        .from('biz_posts')
        .select('id, business_id, title, content, instagram_content')
        .eq('id', id)
        .maybeSingle()) as {
        data: { id: string; business_id: string; title: string; content: string; instagram_content: string | null } | null
      }
      if (!post || post.instagram_content) return

      const business = await loadBusiness(db, post.business_id)
      if (!business) return

      const { generateAndSaveChannelContent } = await import('@/lib/ai/channel-content')
      await generateAndSaveChannelContent(db as never, post.id, {
        businessName: business.name,
        address: business.address,
        geoTitle: post.title,
        geoContent: post.content,
      })
      return
    }

    // 작업보고서 — 보고서에 적힌 내용으로 문구를 만들어 reports.reel_caption에 담는다
    const { data: report } = (await db
      .from('reports')
      .select('id, business_id, booking_id, notes, care_advice, preventive_note, ai_report_data, reel_caption')
      .eq('id', id)
      .maybeSingle()) as {
      data: {
        id: string
        business_id: string
        booking_id: string
        notes: string | null
        care_advice: string | null
        preventive_note: string | null
        ai_report_data: { beforeStatus?: string; workDetails?: string; afterResult?: string } | null
        reel_caption: unknown
      } | null
    }
    if (!report || report.reel_caption) return

    const business = await loadBusiness(db, report.business_id)
    if (!business) return

    const { data: booking } = (await db
      .from('bookings')
      .select('customer_name, service_address, memo')
      .eq('id', report.booking_id)
      .maybeSingle()) as { data: { customer_name: string | null; service_address: string | null; memo: string | null } | null }

    const body = [
      report.ai_report_data?.beforeStatus,
      report.ai_report_data?.workDetails ?? report.notes,
      report.ai_report_data?.afterResult,
      report.preventive_note,
      report.care_advice,
    ].filter(Boolean).join('\n')

    // 재료가 너무 없으면 지어내게 된다 — 그럴 바엔 문구를 안 만든다
    if (body.trim().length < 20) return

    const { generateSocialContent } = await import('@/lib/ai/social-content')
    const c = await generateSocialContent({
      businessName: business.name,
      address: booking?.service_address ?? business.address,
      geoTitle: `${booking?.customer_name ?? '현장'} 청소 작업`,
      geoContent: body,
    })

    await db
      .from('reports')
      .update({
        reel_caption: {
          searchTitle: c.naverTitle,
          searchTags: c.naverTags,
          body: c.instagram,
          bodyTags: c.instagramHashtags,
        },
      } as never)
      .eq('id', id)
  } catch (err) {
    console.error('[Cron] 채널 문구 생성 실패:', err)
  }
}

async function loadBusiness(
  db: SupabaseClient,
  businessId: string,
): Promise<{ name: string; address: string | null } | null> {
  const { data } = (await db
    .from('businesses')
    .select('name, address')
    .eq('id', businessId)
    .maybeSingle()) as { data: { name: string; address: string | null } | null }
  return data
}

/**
 * 아직 Creatomate 주소를 보고 있는 완성 영상을 우리 스토리지로 옮긴다.
 *
 * ★Creatomate는 결과물을 30일만 보관하고 지운다. 옮기는 일은 웹훅에서 이미 하지만,
 *   웹훅이 실패하거나(네트워크·타임아웃) 이 기능 이전에 만들어진 영상은 그대로 남는다.
 *   그것들이 조용히 만료되면 마케팅 화면에 릴스는 보이는데 공유·내려받기가 죽는다.
 *   하루 한 번 훑어 남은 것을 마저 옮긴다 — 30일 안에 몇 번이고 다시 시도할 수 있다.
 */
async function archivePendingReels(db: SupabaseClient): Promise<number> {
  // 한 편이 8MB 안팎이라 한 번에 너무 많이 옮기면 함수 시간(300초)을 넘긴다
  const ARCHIVE_PER_RUN = 20

  // ⚠️'dismissed'(사장님이 다 올리고 목록에서 치운 것)도 반드시 포함한다.
  //   치웠다고 영상까지 버린 게 아니다 — 빼면 치운 순간 30일 시계가 돌기 시작해서,
  //   돈 받고 만든 영상이 조용히 사라진다.
  // ⚠️시공 사례에서 나온 영상도 같이 훑는다 — 빼면 그쪽만 30일 뒤 조용히 사라진다.
  const [reportsRes, postsRes] = await Promise.all([
    db.from('reports')
      .select('id, business_id, booking_id, reel_render_id, reel_url')
      .in('reel_status', [REEL_DONE, 'dismissed'])
      .not('reel_url', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(200),
    db.from('biz_posts')
      .select('id, business_id, reel_render_id, reel_url')
      .in('reel_status', [REEL_DONE, 'dismissed'])
      .not('reel_url', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(200),
  ])

  const candidates: DoneRow[] = [
    ...((reportsRes.data ?? []) as DoneRow[]).map((r) => ({ ...r, table: 'reports' as const })),
    // 시공 사례는 예약이 없으므로 폴더 이름으로 글 id를 쓴다(렌더 때와 같은 규칙)
    ...((postsRes.data ?? []) as Omit<DoneRow, 'booking_id'>[]).map((r) => ({
      ...r,
      booking_id: r.id,
      table: 'biz_posts' as const,
    })),
  ]

  const pending = candidates.filter((r) => !isArchivedUrl(r.reel_url)).slice(0, ARCHIVE_PER_RUN)
  if (pending.length === 0) return 0

  let moved = 0
  for (const row of pending) {
    const url = await archiveReelToStorage(db, {
      businessId: row.business_id,
      bookingId: row.booking_id,
      renderId: row.reel_render_id ?? row.id,
      sourceUrl: row.reel_url!,
    })
    if (url) {
      await db.from(row.table ?? 'reports').update({ reel_url: url } as never).eq('id', row.id)
      moved++
    }
  }

  console.log(`[Cron] 홍보 영상 보관 — ${moved}/${pending.length}편을 우리 스토리지로 옮겼어요`)
  return moved
}
