import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { REEL_PROCESSING, REEL_FAILED } from './queue'

// 대기열에 들어온 보고서 하나를 실제 홍보 영상으로 만든다.
//
// 예전엔 이 로직이 현장 앱 액션(fieldRequestReelAction) 안에 있었다. 그래서 영상을 만들려면
// 현장 직원이 버튼을 누르고 1분을 기다려야 했는데, 홍보는 대표의 일이지 직원의 일이 아니다.
// 지금은 크론이 이 함수를 부른다.
//
// 대본 생성 + 문장별 음성 합성 + 업로드까지 20~40초가 걸리므로, 사용자 요청 안에서
// 부르지 말 것. 반드시 크론에서 부른다.

/** 클립 길이 기록이 없는 예전 보고서에 쓰는 기본값(초) */
const DEFAULT_CLIP_SECONDS = 8

/**
 * 문장 끝에서 당겨내는 시간(초).
 *
 * mp3 파일 끝에는 인코더가 붙이는 짧은 여백이 있어서, 문장을 그대로 이어 붙이면
 * 사이가 살짝 뜬다. 그만큼만 당겨 말이 딱 붙게 한다.
 * ⚠️이 값을 키우면 말끝이 잘린다 — 0.2초를 넘기지 말 것.
 */
const TAIL_TRIM_SECONDS = 0.12
/** 아무리 당겨도 이보다 짧아지지는 않게 (아주 짧은 문장 보호) */
const MIN_LINE_SECONDS = 0.8

// 배경음악은 REEL_MUSIC_URL 환경변수에 트랙 주소를 넣으면 켜진다.
// ⛔값이 없으면 안 깐다 — 아무 노래나 넣으면 인스타·유튜브가 음원을 식별해
//   수익을 가져가거나 영상을 내린다. 저작권이 정리된 트랙만 넣을 것.

interface ReelSource {
  id: string
  business_id: string
  booking_id: string
  work_clip_urls: string[] | null
  work_clip_durations: number[] | null
  notes: string | null
  preventive_note: string | null
  care_advice: string | null
  ai_report_data: {
    beforeStatus?: string
    workDetails?: string
    afterResult?: string
  } | null
  report_photos: { url: string; type: string; sort_order: number }[]
}

export type RenderOutcome =
  | { ok: true; renderId: string }
  | { ok: false; reason: string }

/**
 * 보고서 하나로 홍보 영상 제작을 요청한다.
 *
 * 성공하면 reel_status를 'processing'으로 바꾸고, 완성 알림은 Creatomate 웹훅이 받는다.
 * 재료가 모자라거나 실패하면 'failed'로 남겨 다음 날 다시 시도되게 한다.
 */
export async function renderReelForReport(
  db: SupabaseClient,
  reportId: string,
): Promise<RenderOutcome> {
  const { data: report } = (await db
    .from('reports')
    .select(
      'id, business_id, booking_id, work_clip_urls, work_clip_durations, notes, preventive_note, care_advice, ai_report_data, report_photos(url, type, sort_order)',
    )
    .eq('id', reportId)
    .maybeSingle()) as { data: ReelSource | null }

  if (!report) return { ok: false, reason: '보고서 없음' }

  const markFailed = async (reason: string): Promise<RenderOutcome> => {
    await db.from('reports').update({ reel_status: REEL_FAILED } as never).eq('id', reportId)
    return { ok: false, reason }
  }

  // 영상은 1개만 있어도 만든다 — 3개를 못 채워서 아예 못 만드는 것보단 낫다
  const clipUrls = (report.work_clip_urls ?? []).filter(Boolean)
  if (clipUrls.length === 0) return markFailed('작업 중 영상 없음')

  // 클립 길이는 영상을 고를 때 브라우저에서 읽어 저장해둔 값이다.
  // 예전 보고서엔 없을 수 있는데, 그때는 다 비슷한 길이로 본다.
  const durations = report.work_clip_durations ?? []
  const clips = clipUrls.map((url, i) => ({
    url,
    duration: durations[i] && durations[i] > 0 ? durations[i] : DEFAULT_CLIP_SECONDS,
  }))

  const photos = report.report_photos ?? []
  const before = photos.filter((p) => p.type === 'before').sort((a, b) => a.sort_order - b.sort_order)[0]
  const after = photos.filter((p) => p.type === 'after').sort((a, b) => a.sort_order - b.sort_order)[0]
  if (!before) return markFailed('작업 전 사진 없음')
  if (!after) return markFailed('작업 후 사진 없음')

  const { data: business } = await db
    .from('businesses')
    .select('name')
    .eq('id', report.business_id)
    .maybeSingle()
  if (!business) return markFailed('업체 정보 없음')

  // 서비스명 (대본 맥락용)
  let cleaningType = '청소 서비스'
  const { data: booking } = (await db
    .from('bookings')
    .select('memo, quote_id')
    .eq('id', report.booking_id)
    .maybeSingle()) as { data: { memo: string | null; quote_id: string | null } | null }

  if (booking?.quote_id) {
    const { data: quote } = await db
      .from('quotes')
      .select('cleaning_type')
      .eq('id', booking.quote_id)
      .maybeSingle()
    if (quote?.cleaning_type) cleaningType = quote.cleaning_type as string
  }

  try {
    // 오늘 보고서에 실제로 적힌 것만으로 나레이션 대본을 만든다
    const { generateReelScript } = await import('@/lib/ai/reel-script')
    const draft = await generateReelScript({
      cleaningType,
      beforeStatus: report.ai_report_data?.beforeStatus ?? booking?.memo ?? '',
      workDetails: report.ai_report_data?.workDetails ?? report.notes ?? '',
      afterResult: report.ai_report_data?.afterResult ?? '',
      siteNote: report.preventive_note ?? booking?.memo ?? '',
      careAdvice: report.care_advice ?? '',
    })

    // 문장을 하나씩 음성으로 만들고 그 mp3의 '실제' 길이를 자막 길이로 삼는다.
    // 합성이 안 되면 추정값 그대로 무음 영상을 만든다.
    const { synthesizeLines } = await import('@/lib/ai/narration')
    const stamp = Date.now()
    const spoken = await synthesizeLines(draft.map((l) => l.text))

    let lines = draft
    let narrationUrls: string[] = []

    if (spoken) {
      const uploaded: string[] = []
      for (const [i, clip] of spoken.entries()) {
        const path = `${report.business_id}/${report.booking_id}/narration/${stamp}-${i}.mp3`
        const { error: upErr } = await db.storage
          .from('report-photos')
          .upload(path, clip.mp3, { contentType: 'audio/mpeg', upsert: true })
        if (upErr) {
          console.error('[Reel] 나레이션 업로드 실패:', upErr)
          break
        }
        uploaded.push(db.storage.from('report-photos').getPublicUrl(path).data.publicUrl)
      }

      // 전부 올라갔을 때만 음성을 쓴다 — 일부만 올라가면 중간에 목소리가 끊긴다
      if (uploaded.length === spoken.length) {
        narrationUrls = uploaded
        // ⛔문장 사이에 틈을 주지 않는다. 예전엔 0.35초씩 넣었는데, 숏폼에서 그 빈틈이
        //   곧 이탈 지점이다. 말이 끊기지 않고 계속 밀어붙여야 끝까지 본다.
        //   mp3 끝에 붙는 인코더 여백만 조금 당겨 문장이 딱 붙게 한다.
        lines = draft.map((l, i) => ({
          ...l,
          seconds: Math.max(
            MIN_LINE_SECONDS,
            Math.round((spoken[i].seconds - TAIL_TRIM_SECONDS) * 100) / 100,
          ),
        }))
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
    const { requestReelRender } = await import('@/lib/creatomate/client')

    const renderId = await requestReelRender({
      beforePhotoUrl: before.url,
      clips,
      afterPhotoUrl: after.url,
      businessName: business.name as string,
      lines,
      narrationUrls,
      musicUrl: process.env.REEL_MUSIC_URL || null,
      webhookUrl: `${appUrl}/api/creatomate/webhook`,
    })

    await db
      .from('reports')
      .update({ reel_status: REEL_PROCESSING, reel_render_id: renderId } as never)
      .eq('id', reportId)

    return { ok: true, renderId }
  } catch (err) {
    console.error('[Reel] 제작 실패:', err)
    return markFailed(err instanceof Error ? err.message : '알 수 없는 오류')
  }
}
