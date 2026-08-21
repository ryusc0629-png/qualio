import { createServiceClient } from '@/lib/supabase/server'
import { Film, Clock, Download } from 'lucide-react'
import { ReelShareButtons } from './reel-share-buttons'
import { ReelMakeNowButton } from './reel-make-now-button'
import { ReelAutoRefresh } from './reel-auto-refresh'

// 현장이 올린 재료로 만들어진 홍보 영상이 여기로 온다.
//
// 왜 대표 화면에 있나: 홍보는 대표의 일이다. 현장 직원에게 '만들기' 버튼을 누르고
// 1분을 기다리게 하는 건 그냥 일이 하나 느는 것이고, 무엇을 올릴지 고르는 것도 대표의 판단이다.
// 현장은 찍어서 올리기만 하고, 완성된 영상은 여기 쌓인다.

interface ReelRow {
  id: string
  reel_status: string | null
  reel_url: string | null
  reel_queued_at: string | null
  booking_id: string
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })

export async function ReelInboxCard({ businessId }: { businessId: string }) {
  const db = createServiceClient()

  const { data } = (await db
    .from('reports')
    .select('id, reel_status, reel_url, reel_queued_at, booking_id')
    .eq('business_id', businessId)
    .in('reel_status', ['queued', 'processing', 'done', 'failed'])
    .order('reel_queued_at', { ascending: false, nullsFirst: false })
    .limit(12)) as { data: ReelRow[] | null }

  const rows = data ?? []
  const done = rows.filter((r) => r.reel_status === 'done' && r.reel_url)
  const waiting = rows.filter((r) => r.reel_status !== 'done')

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
  const pending = rows.some((r) => r.reel_status === 'processing' || r.reel_status === 'queued')

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

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">아직 만들어진 홍보 영상이 없어요</p>
          <p className="text-xs text-muted-foreground">
            현장에서 작업 보고서에 영상을 올리면 다음 날 여기에 도착해요
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {done.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center gap-3">
                {/* 미리보기 — 소리 없이 첫 장면만 보여준다 */}
                <video
                  src={r.reel_url!}
                  className="w-16 h-24 rounded-lg object-cover bg-muted shrink-0"
                  preload="metadata"
                  muted
                  playsInline
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{names.get(r.booking_id) ?? '현장'}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">올릴 준비가 됐어요</p>
                </div>
              </div>
              <ReelShareButtons url={r.reel_url!} label={names.get(r.booking_id) ?? '현장'} />
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
              </div>
              {/* 기다리기 싫으면 지금 만든다 — 오늘 찍은 걸 오늘 올리고 싶을 때 */}
              {r.reel_status !== 'processing' && <ReelMakeNowButton reportId={r.id} />}
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground border-t pt-3">
          <Download className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          영상을 내려받아 인스타그램·틱톡에 올리시면 돼요. 글은 아래 &lsquo;글 만들기&rsquo;에서 뽑을 수 있어요.
        </p>
      )}
    </div>
  )
}
