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
 * 문장과 문장 사이에 두는 틈(초).
 *
 * 0이면 딱 붙어서 말이 몰아치듯 나간다. 사장님 요청이 "숨쉬는 시간을 없애달라"였고,
 * 앞뒤 무음은 이미 wav에서 정확히 잘라내므로 여기서 더 줄 이유가 없다.
 * ⚠️예전엔 여기서 0.12초를 '감으로' 당겼다 — 실제 무음 길이는 파일마다 달라서
 *   어떤 문장은 여백이 남고 어떤 문장은 말끝이 씹혔다.
 */
const GAP_SECONDS = 0.06

/**
 * 배경음악 트랙.
 *
 * 우리가 만든 트랙이라 저작권이 우리에게 있다(fal.ai Stable Audio Open, 2026-08-21 생성).
 * ⛔남의 노래를 넣지 말 것 — 인스타·유튜브가 음원을 식별해 수익을 가져가거나 영상을 내린다.
 * ⚠️끝 무음을 잘라낸 판이다(안 자르면 반복될 때마다 소리가 1초씩 끊긴다).
 *   교체하려면 `npm run reel:music`으로 새로 만들고 --upload 로 올린 주소를 넣을 것.
 * 환경변수 REEL_MUSIC_URL로 덮어쓸 수 있다(빈 문자열로 두면 음악 없이 나간다).
 *
 * ★2026-08-22 교체 — 사장님: "똑딱똑딱 브금이 좀 아쉬워요, 더 리드미컬하게".
 *   원인은 곡이 나빠서가 아니라 **짧은 루프를 되풀이해서**였다. 옛 트랙은 10.9초라
 *   37초 영상에서 3.4번 반복되고 LRA 0.2 LU(=세기 변화 없음)라 메트로놈처럼 들렸다.
 *   새 트랙은 '1-단단한비트'(125 BPM·초당 5.4타점)를 재료로:
 *     ① 뒤에 붙은 무음 2.1초를 잘라내고
 *     ② 마디에 맞춰 5마디(9.60초)로 끊고 — 아무 데서나 자르면 이음새에서 박이 튄다
 *     ③ 5번 이어붙이며 -5dB → 0dB로 자라게 해 48초짜리 한 곡으로 만들었다.
 *   결과: 릴스보다 길어 **반복이 아예 없고**, LRA 0.2 → 6.6 LU.
 *   ⛔짧은 루프를 그대로 넣지 말 것 — 볼륨이나 곡을 바꿔도 되풀이되면 또 똑딱거린다.
 *
 * ⚠️**브금은 릴스보다 넉넉히 길어야 한다.** 처음엔 38.4초로 만들었는데 그날 실제 릴스가
 *   38.2초로 나와 여유가 0.2초뿐이었다. 대본이 조금만 길어지면 브금이 처음으로 되감기며
 *   이음새가 생기고, 그게 바로 없애려던 '똑딱거림'이다. MAX_TOTAL_SECONDS(35)+아웃트로(2)는
 *   대본 기준 상한일 뿐이고, 실제 길이는 합성된 음성의 실측치라 넘칠 수 있다.
 *   지금은 48초라 10초쯤 여유가 있다. 대본 상한을 올리면 이 트랙도 같이 늘릴 것.
 */
const DEFAULT_MUSIC_URL =
  'https://wjxcrgwfeqkgvvyakack.supabase.co/storage/v1/object/public/report-photos/_shared/reel-music/beat125-48s-1.mp3'

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

  const { data: business } = (await db
    .from('businesses')
    .select('name, phone')
    .eq('id', report.business_id)
    .maybeSingle()) as { data: { name: string; phone: string | null } | null }
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
        const path = `${report.business_id}/${report.booking_id}/narration/${stamp}-${i}.wav`
        const { error: upErr } = await db.storage
          .from('report-photos')
          .upload(path, clip.wav, { contentType: 'audio/wav', upsert: true })
        if (upErr) {
          console.error('[Reel] 나레이션 업로드 실패:', upErr)
          break
        }
        uploaded.push(db.storage.from('report-photos').getPublicUrl(path).data.publicUrl)
      }

      // 전부 올라갔을 때만 음성을 쓴다 — 일부만 올라가면 중간에 목소리가 끊긴다
      if (uploaded.length === spoken.length) {
        narrationUrls = uploaded
        // 앞뒤 무음을 이미 잘라낸 길이라 그대로 쓰면 말이 딱 붙는다.
        // 숏폼에서 문장 사이의 빈틈이 곧 이탈 지점이다.
        lines = draft.map((l, i) => ({
          ...l,
          seconds: Math.round((spoken[i].seconds + GAP_SECONDS) * 100) / 100,
        }))
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
    const { requestReelRender } = await import('@/lib/creatomate/client')

    const renderId = await requestReelRender({
      beforePhotoUrl: before.url,
      clips,
      afterPhotoUrl: after.url,
      businessName: business.name,
      businessPhone: business.phone,
      lines,
      narrationUrls,
      musicUrl: process.env.REEL_MUSIC_URL ?? DEFAULT_MUSIC_URL,
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
