import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// 홍보 영상은 '현장이 만드는 것'이 아니라 '현장이 재료를 올리면 알아서 만들어지는 것'이다.
//
// 왜 이렇게 바꿨나: 예전엔 현장 앱에 '홍보 영상 만들기' 버튼이 있었다.
// 그런데 홍보는 대표의 일이지 현장 직원의 일이 아니다. 버튼을 누르고 1분을 기다리는 것도
// 현장에선 그냥 일이 하나 더 느는 것이고, 직원 입장에선 눌러야 할 이유도 없다.
// 그래서 버튼을 없애고, 보고서를 보내거나 작업을 끝내면 대기열에 들어가게 했다.
// 실제 제작은 크론이 하고, 완성되면 대표에게 알림이 간다.
//
// ⚠️ 여기서 영상을 '만들지' 않는다. 대본 생성 + 문장별 음성 합성 + 업로드까지 하면
//    20~40초가 걸리는데, 그걸 현장 직원의 '발송하기' 요청 안에서 하면 그만큼 화면이 멈춘다.
//    표시만 바꾸고(즉시) 실제 제작은 크론에 맡긴다.

/** reports.reel_status 값 */
export const REEL_IDLE = 'idle'
export const REEL_QUEUED = 'queued'
export const REEL_PROCESSING = 'processing'
export const REEL_DONE = 'done'
export const REEL_FAILED = 'failed'

interface ReelReadyRow {
  id: string
  reel_status: string | null
  work_clip_urls: string[] | null
  report_photos: { type: string }[]
}

/**
 * 이 예약의 홍보 영상을 대기열에 넣는다.
 *
 * 재료가 모자라면 조용히 넘어간다 — 현장 직원에게 "영상이 없어요" 같은 걸 알릴 이유가 없다.
 * 이미 만들었거나 만드는 중이면 건드리지 않는다(여러 번 눌러도 한 번만 만들어진다).
 *
 * 실패해도 부르는 쪽(보고서 발송·작업 완료)을 막지 않는다.
 */
export async function queueReelForBooking(
  db: SupabaseClient,
  businessId: string,
  bookingId: string,
): Promise<boolean> {
  try {
    const { data: report } = (await db
      .from('reports')
      .select('id, reel_status, work_clip_urls, report_photos(type)')
      .eq('booking_id', bookingId)
      .eq('business_id', businessId)
      .maybeSingle()) as { data: ReelReadyRow | null }

    if (!report) return false

    // 이미 대기 중·제작 중·완성됐으면 그대로 둔다
    const status = report.reel_status ?? REEL_IDLE
    if (status !== REEL_IDLE && status !== REEL_FAILED) return false

    // 재료 확인 — 영상 1개 + 작업 전/후 사진 각 1장
    const clips = (report.work_clip_urls ?? []).filter(Boolean)
    if (clips.length === 0) return false

    const photos = report.report_photos ?? []
    if (!photos.some((p) => p.type === 'before')) return false
    if (!photos.some((p) => p.type === 'after')) return false

    const { error } = await db
      .from('reports')
      .update({ reel_status: REEL_QUEUED, reel_queued_at: new Date().toISOString() } as never)
      .eq('id', report.id)

    if (error) {
      console.error('[Reel] 대기열 등록 실패:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[Reel] 대기열 등록 중 오류:', err)
    return false
  }
}
