import { createServiceClient } from '@/lib/supabase/server'
import { Film, Clock } from 'lucide-react'
import { ReelDoneItem } from './reel-done-item'
import { buildReelCaptions } from '@/lib/reel/channel-captions'
import { ReelFromClipsButton } from './reel-from-clips-button'
import { ReelMakeNowButton } from './reel-make-now-button'
import { ReelAutoRefresh } from './reel-auto-refresh'
import { getReelUsage } from '@/lib/reel/charges'
import { REEL_FREE_QUOTA, REEL_UNIT_PRICE } from '@/lib/reel/pricing'
import type { SupabaseClient } from '@supabase/supabase-js'

// 현장이 올린 재료로 만들어진 홍보 영상이 여기로 온다.
//
// 왜 대표 화면에 있나: 홍보는 대표의 일이다. 현장 직원에게 '만들기' 버튼을 누르고
// 1분을 기다리게 하는 건 그냥 일이 하나 느는 것이고, 무엇을 올릴지 고르는 것도 대표의 판단이다.
// 현장은 찍어서 올리기만 하고, 완성된 영상은 여기 쌓인다.

interface PortfolioReelRow {
  id: string
  title: string
  reel_status: string | null
  reel_url: string | null
  reel_queued_at: string | null
  reel_error: string | null
  naver_title: string | null
  naver_tags: string[] | null
  instagram_content: string | null
  instagram_hashtags: string[] | null
  source_report_id: string | null
}

interface CaptionSource {
  naver_title: string | null
  naver_tags: string[] | null
  instagram_content: string | null
  instagram_hashtags: string[] | null
}

/** 영상 하나를 네 채널(인스타·틱톡·쇼츠·네이버 클립)에 올릴 문구 세트로 만든다 */
function captionsOf(src: CaptionSource | undefined) {
  if (!src) return []
  return buildReelCaptions({
    searchTitle: src.naver_title,
    searchTags: src.naver_tags,
    body: src.instagram_content,
    bodyTags: src.instagram_hashtags,
  })
}

interface ReelRow {
  id: string
  reel_status: string | null
  reel_url: string | null
  reel_queued_at: string | null
  reel_error: string | null
  booking_id: string
  /** 영상에 붙는 채널 문구 — 크론이 제작 직후 채운다 */
  reel_caption: { searchTitle?: string; searchTags?: string[]; body?: string; bodyTags?: string[] } | null
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })

export async function ReelInboxCard({ businessId }: { businessId: string }) {
  const db = createServiceClient()

  const { data } = (await db
    .from('reports')
    .select('id, reel_status, reel_url, reel_queued_at, reel_error, booking_id, reel_caption')
    .eq('business_id', businessId)
    .in('reel_status', ['queued', 'processing', 'done', 'failed'])
    .order('reel_queued_at', { ascending: false, nullsFirst: false })
    .limit(12)) as { data: ReelRow[] | null }

  // 시공 사례로 만든 릴스도 같은 목록에 보여준다 — 만든 방법이 달라도 사장님에겐 같은 '홍보 영상'이다
  const { data: postRows } = (await db
    .from('biz_posts' as never)
    .select('id, title, reel_status, reel_url, reel_queued_at, reel_error, naver_title, naver_tags, instagram_content, instagram_hashtags, source_report_id' as never)
    .eq('business_id' as never, businessId)
    .in('reel_status' as never, ['queued', 'processing', 'done', 'failed'])
    .order('reel_queued_at' as never, { ascending: false, nullsFirst: false })
    .limit(12)) as { data: PortfolioReelRow[] | null }

  const usage = await getReelUsage(db as unknown as SupabaseClient, businessId)

  // 등록된 서비스 이름 — '갖고 있는 영상으로 만들기'에서 고르게 한다
  const { data: services } = await db
    .from('service_items')
    .select('name')
    .eq('business_id', businessId)
    .order('name')
  const serviceNames = Array.from(new Set((services ?? []).map((s) => s.name as string))).slice(0, 12)

  const rows = data ?? []
  const posts = postRows ?? []
  const done = rows.filter((r) => r.reel_status === 'done' && r.reel_url)
  const waiting = rows.filter((r) => r.reel_status !== 'done')
  const postsDone = posts.filter((p) => p.reel_status === 'done' && p.reel_url)
  const postsWaiting = posts.filter((p) => p.reel_status !== 'done')

  // 고객 이름을 붙여야 어느 현장인지 안다
  const bookingIds = rows.map((r) => r.booking_id)
  const names = new Map<string, string>()
  if (bookingIds.length > 0) {
    const { data: bookings } = await db
      .from('bookings')
      .select('id, customer_name, scheduled_at')
      .in('id', bookingIds)
    for (const b of bookings ?? []) {
      names.set(b.id, `${b.customer_name} · ${fmtDate(b.scheduled_at)}`)
    }
  }

  // 만드는 중인 게 있을 때만 화면을 스스로 갱신한다 —
  // 완성 알림은 폰으로 가는데 PC 화면이 '만드는 중'에 멈춰 있으면 고장 난 것처럼 보인다
  const pending = [...rows, ...posts].some(
    (r) => r.reel_status === 'processing' || r.reel_status === 'queued',
  )

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      {pending && <ReelAutoRefresh />}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
          <Film className="h-5 w-5 text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">홍보 영상</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            현장에서 찍어 올린 영상으로 자동으로 만들어져요. 확인하고 올리기만 하시면 돼요
          </p>
        </div>
      </div>

      {/* 얼마나 남았는지 · 한 편에 얼마인지 · 왜 한 편 더 만들 만한지.
          결제창을 또 띄우지 않고 다음 정기결제에 얹히므로, 얼마가 붙는지는 미리 보여야 한다.
          ⚠️여기 문구에 '매출이 오른다' 같은 성과 보장을 쓰지 말 것 — 우리는 릴스가 매출로
             이어졌는지 측정하지 못한다(유입 귀속이 안 붙어 있다). 대신 값을 비교하고,
             사장님이 실제로 할 일이 얼마나 적은지를 말한다. 둘 다 사실이라 흔들리지 않는다. */}
      <div className="rounded-lg bg-muted/40 border px-3 py-2.5 text-xs space-y-1.5">
        {!Number.isFinite(usage.freeLeft) ? (
          <p className="text-muted-foreground">본사 계정이라 제한 없이 만들 수 있어요</p>
        ) : usage.freeLeft > 0 ? (
          <p>
            <span className="font-semibold text-foreground">무료 {usage.freeLeft}편</span>
            <span className="text-muted-foreground"> 남았어요 (가입하면 {REEL_FREE_QUOTA}편을 그냥 드려요)</span>
          </p>
        ) : (
          <p className="text-muted-foreground">
            무료 {REEL_FREE_QUOTA}편을 다 쓰셨어요. 이제 한 편에{' '}
            <span className="font-semibold text-foreground">{REEL_UNIT_PRICE.toLocaleString()}원</span>
            <span className="text-muted-foreground"> (부가세 별도)</span>
          </p>
        )}

        {/* 왜 한 편 더 만들 만한가 — 값 비교와 '할 일이 적다'는 사실만 쓴다 */}
        <p className="text-muted-foreground leading-relaxed">
          영상 한 편을 대행사에 맡기면 보통 <span className="font-medium text-foreground">7~10만원</span>이에요.
          여기서는 <span className="font-medium text-foreground">{REEL_UNIT_PRICE.toLocaleString()}원</span>이고,
          사장님이 하실 일은 <span className="font-medium text-foreground">영상을 올리는 것</span>뿐이에요.
          촬영본은 폰 안에 있으면 아무 일도 하지 않아요.
        </p>

        {usage.pendingCount > 0 && (
          <p className="text-muted-foreground border-t pt-1.5">
            이번 달 {usage.pendingCount}편 ·{' '}
            <span className="font-semibold text-foreground">
              {usage.pendingAmount.toLocaleString()}원
            </span>{' '}
            — 다음 결제에 함께 청구돼요 (부가세 별도)
          </p>
        )}
      </div>

      {rows.length === 0 && posts.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">아직 만들어진 홍보 영상이 없어요</p>
          <p className="text-xs text-muted-foreground">
            현장에서 작업 보고서에 영상을 올리면 다음 날 여기에 도착해요
          </p>
          <p className="text-xs text-muted-foreground">
            예전에 찍어둔 영상이 있으면 아래 버튼으로 지금 만들 수 있어요
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {done.map((r) => (
            <ReelDoneItem
              key={r.id}
              reportId={r.id}
              url={r.reel_url!}
              label={names.get(r.booking_id) ?? '현장'}
              captions={buildReelCaptions({
                searchTitle: r.reel_caption?.searchTitle ?? null,
                searchTags: r.reel_caption?.searchTags ?? null,
                body: r.reel_caption?.body ?? null,
                bodyTags: r.reel_caption?.bodyTags ?? null,
              })}
            />
          ))}

          {/* 시공 사례로 만든 것 — 만든 방법만 다를 뿐 사장님에겐 같은 홍보 영상이다 */}
          {postsDone.map((p) => (
            <ReelDoneItem
              key={p.id}
              reportId={p.id}
              url={p.reel_url!}
              label={p.title}
              source="portfolio"
              captions={captionsOf(p)}
            />
          ))}

          {postsWaiting.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-dashed p-3">
              <div className="w-16 h-24 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.reel_status === 'processing'
                    ? '만드는 중이에요'
                    : p.reel_status === 'failed'
                      ? '못 만들었어요'
                      : '곧 만들어져요'}
                </p>
                {p.reel_status === 'failed' && p.reel_error && (
                  <p className="text-[11px] text-rose-600 mt-1 break-words">{p.reel_error}</p>
                )}
              </div>
            </div>
          ))}

          {waiting.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-dashed p-3">
              <div className="w-16 h-24 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{names.get(r.booking_id) ?? '현장'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.reel_status === 'processing'
                    ? '만드는 중이에요'
                    : r.reel_status === 'failed'
                      ? '못 만들었어요. 다시 눌러보세요'
                      : '내일 아침에 만들어져요'}
                </p>
                {/* 왜 실패했는지 보여준다 — 사장님이 고칠 수 있는 문제일 수 있다 */}
                {r.reel_status === 'failed' && r.reel_error && (
                  <p className="text-[11px] text-rose-600 mt-1 break-words">{r.reel_error}</p>
                )}
              </div>
              {/* 기다리기 싫으면 지금 만든다 — 오늘 찍은 걸 오늘 올리고 싶을 때 */}
              {r.reel_status !== 'processing' && <ReelMakeNowButton reportId={r.id} />}
            </div>
          ))}
        </div>
      )}

      {/* 작업보고서가 없어도 만들 수 있는 길 — 예전에 찍어둔 영상, 예약을 안 쓰는 업체 */}
      <div className="border-t pt-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          지난 현장에서 찍어둔 영상이 있으면 지금 한 편 더 만들 수 있어요. 예약이나 작업 보고서가 없어도 돼요.
        </p>
        <ReelFromClipsButton businessId={businessId} serviceNames={serviceNames} />
      </div>


    </div>
  )
}
