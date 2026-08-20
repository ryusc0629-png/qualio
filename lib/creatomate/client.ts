import { toCaptions, type ReelLine, type ReelCaption } from '@/lib/ai/reel-script'

// 릴스 합성 — 나레이션이 뼈대다.
//
// 예전 구조: 앞사진 3초 + 클립 10초×3 + 뒷사진 3초 + 아웃트로 2초(=38초), 소리 없음.
// 문제는 무음 상태로 화면이 10초씩 멈춰 있다는 것이었다. 거기서 시청자가 나간다.
// 지금 구조: 대본 문장 하나가 자막 한 줄이자 음성 한 마디이고, 화면 길이는 그 문장 길이를 따라간다.
// 컷 수를 늘리지 않아도 되는 이유는 목소리가 계속 정보를 밀어주기 때문이다.

/** 현장에서 올린 작업 영상 한 개 */
export interface ReelClip {
  url: string
  /** 실제 길이(초). 브라우저에서 고를 때 읽어 저장해둔 값 */
  duration: number
}

interface ReelInput {
  beforePhotoUrl: string
  /** 1~3개. 개수가 적으면 그만큼만 쓴다 */
  clips: ReelClip[]
  afterPhotoUrl: string
  businessName: string
  /**
   * 나레이션 대본 — 한 줄이 자막 한 컷이자 음성 한 마디.
   * seconds는 합성된 mp3의 '실제' 길이여야 한다(추정값이 아니라).
   */
  lines: ReelLine[]
  /**
   * 문장별 음성 파일 주소 — lines와 같은 순서, 같은 개수.
   * 비어 있으면 자막만 나가고 무음이 된다.
   */
  narrationUrls: string[]
  webhookUrl: string
}

interface CreatomateRender {
  id: string
  status: string
  url?: string
}

const FONT = 'Gothic A1'
const STROKE = '#000000'
/** 강조 문장(첫 줄·마지막 줄) 색 — 나머지는 흰색 */
const EMPHASIS_COLOR = '#FFD60A'
/** 업체명 아웃트로 길이 */
const OUTRO_SECONDS = 2

type Element = Record<string, unknown>

/** 배경에 깔리는 화면 한 장(사진 또는 영상 클립) */
export interface Visual {
  kind: 'image' | 'video'
  source: string
  start: number
  duration: number
}

/** 작업 전·후 사진이 화면에 머무는 시간(초) */
const PHOTO_SECONDS = 3

/**
 * 배경 화면을 깐다: 작업 전 사진 → 클립들 → 작업 후 사진.
 *
 * ★영상은 뒤에 깔리는 배경일 뿐이다. 자막이 무슨 말을 하고 있는지와 맞출 필요가 없다.
 *  그래서 클립은 각자 원래 길이만큼 순서대로 나오고, 나레이션이 끝날 때까지 처음부터 다시 돈다.
 *  (예전엔 자막 길이에 맞춰 클립을 늘렸다 줄였다 해서, 짧은 클립이 계속 되감기고
 *   긴 클립은 앞부분만 잘려 나왔다.)
 *
 * 클립 길이를 모르면(예전 보고서) 기본값으로 잡는다 — 배경이라 조금 어긋나도 티가 안 난다.
 */
export function planVisuals(
  totalSeconds: number,
  beforePhotoUrl: string,
  clips: ReelClip[],
  afterPhotoUrl: string,
): Visual[] {
  const out: Visual[] = []
  const photo = Math.min(PHOTO_SECONDS, totalSeconds / 3)

  // 앞사진
  out.push({ kind: 'image', source: beforePhotoUrl, start: 0, duration: photo })

  // 가운데 = 클립들이 순서대로, 다 돌면 처음부터 다시
  const middleStart = photo
  const middleEnd = Math.max(middleStart, totalSeconds - photo)
  const usable = clips.filter((c) => c.url && c.duration > 0)

  let cursor = middleStart
  let i = 0
  // 클립이 하나도 없으면 앞사진을 그만큼 더 오래 띄운다
  if (usable.length === 0) {
    out[0].duration = middleEnd
  } else {
    // 한 바퀴가 너무 짧아 무한히 도는 것을 막는 안전장치
    const guard = 200
    while (cursor < middleEnd - 0.05 && out.length < guard) {
      const clip = usable[i % usable.length]
      const duration = Math.min(clip.duration, middleEnd - cursor)
      out.push({ kind: 'video', source: clip.url, start: Math.round(cursor * 100) / 100, duration: Math.round(duration * 100) / 100 })
      cursor += duration
      i++
    }
  }

  // 뒷사진
  out.push({
    kind: 'image',
    source: afterPhotoUrl,
    start: Math.round(middleEnd * 100) / 100,
    duration: Math.round((totalSeconds - middleEnd) * 100) / 100,
  })

  return out.filter((v) => v.duration > 0.05)
}

/** 자막 한 조각 — 화면 가운데, 흰색(강조는 노랑) */
function captionElement(cap: ReelCaption): Element {
  return {
    type: 'text',
    track: 3,
    time: cap.start,
    duration: cap.seconds,
    width: '86%',
    height: 'auto',
    x_anchor: '50%',
    y_anchor: '50%',
    y: '50%',
    text: cap.text,
    font_family: FONT,
    font_weight: '800',
    font_size: '6.6 vmin',
    fill_color: cap.emphasis ? EMPHASIS_COLOR : '#ffffff',
    stroke_color: STROKE,
    stroke_width: '1.1 vmin',
    line_height: '135%',
    // 조각이 1~2초마다 바뀌므로 페이드는 짧게 — 길면 다음 조각과 겹쳐 보인다
    animations: [{ time: 0, duration: 0.15, easing: 'quadratic-out', type: 'fade' }],
  }
}

export async function requestReelRender(input: ReelInput): Promise<string> {
  const apiKey = process.env.CREATOMATE_API_KEY
  if (!apiKey) throw new Error('[APP] 영상 편집 서비스가 설정되지 않았어요')

  const fadeIn = [{ time: 0, duration: 0.4, easing: 'quadratic-out', type: 'fade' }]

  // 전체 길이는 나레이션이 정한다 — 영상 클립 길이와는 무관하다
  const narrationEnd = input.lines.reduce((s, l) => s + l.seconds, 0)
  const total = Math.round((narrationEnd + OUTRO_SECONDS) * 10) / 10

  // ── 배경 화면 — 앞사진 → 클립들(다 돌면 처음부터 다시) → 뒷사진 ──
  const visual: Element[] = planVisuals(
    narrationEnd,
    input.beforePhotoUrl,
    input.clips,
    input.afterPhotoUrl,
  ).map((v, i) =>
    v.kind === 'image'
      ? {
          name: `bg-${i}`,
          type: 'image',
          track: 1,
          time: v.start,
          duration: v.duration,
          width: '100%',
          height: '100%',
          x_anchor: '50%',
          y_anchor: '50%',
          // cover = 세로 화면을 꽉 채운다. 가로로 찍은 영상은 좌우가 잘린다.
          fit: 'cover',
          source: v.source,
        }
      : {
          name: `bg-${i}`,
          type: 'video',
          track: 1,
          time: v.start,
          duration: v.duration,
          width: '100%',
          height: '100%',
          x_anchor: '50%',
          y_anchor: '50%',
          fit: 'cover',
          // 마지막 한 바퀴는 중간에 잘릴 수 있다 — 배경이라 문제되지 않는다
          loop: true,
          // 나레이션이 주인공이라 현장 소리는 배경으로만 깔린다.
          // ⚠️ Creatomate volume은 0~100 퍼센트다(기본 '100%'). 0.12로 적으면 12%가 아니라
          // 0.12%라 소리가 아예 안 들린다 — 예전 0.4도 같은 오해였다.
          volume: '12%',
          source: v.source,
        },
  )

  // ── 자막 — 문장을 1~2초 조각으로 쪼개 계속 넘어가게 한다 ──
  const captions: Element[] = toCaptions(input.lines).map(captionElement)

  // ── 나레이션 음성 — 문장마다 제 시각에 얹는다 ──
  // 통 파일 하나로 깔면 자막과 조금씩 어긋나는데, 문장별로 놓으면 어긋날 수가 없다.
  let spokenAt = 0
  const audio: Element[] =
    input.narrationUrls.length === input.lines.length
      ? input.lines.map((line, i) => {
          const time = Math.round(spokenAt * 100) / 100
          spokenAt += line.seconds
          return {
            type: 'audio',
            track: 5,
            time,
            duration: line.seconds,
            source: input.narrationUrls[i],
          }
        })
      : []

  // ── 업체명 아웃트로 ───────────────────────────────────
  const outro: Element[] = [
    {
      type: 'shape',
      track: 1,
      time: narrationEnd,
      duration: OUTRO_SECONDS,
      width: '100%',
      height: '100%',
      x_anchor: '50%',
      y_anchor: '50%',
      fill_color: '#0f172a',
      path: 'M 0 0 L 100 0 L 100 100 L 0 100 L 0 0 Z',
    },
    {
      name: 'business-name',
      type: 'text',
      track: 2,
      time: narrationEnd,
      duration: OUTRO_SECONDS,
      width: '90%',
      height: 'auto',
      x_anchor: '50%',
      y_anchor: '50%',
      y: '46%',
      text: input.businessName,
      font_family: FONT,
      font_size: '10 vmin',
      font_weight: '900',
      fill_color: '#ffffff',
      animations: fadeIn,
    },
    {
      type: 'text',
      track: 3,
      time: narrationEnd,
      duration: OUTRO_SECONDS,
      width: '90%',
      height: 'auto',
      x_anchor: '50%',
      y_anchor: '0%',
      y: '56%',
      text: '믿고 맡기는 깨끗함',
      font_family: FONT,
      font_size: '4.5 vmin',
      font_weight: '700',
      fill_color: '#19E68C',
      animations: fadeIn,
    },
  ]

  const source = {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    duration: total,
    elements: [...visual, ...captions, ...audio, ...outro],
  }

  const res = await fetch('https://api.creatomate.com/v1/renders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source, webhook_url: input.webhookUrl }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[Creatomate] 렌더 요청 실패:', res.status, errText.slice(0, 500))
    throw new Error('[APP] 영상 편집 요청에 실패했어요. 잠시 후 다시 시도해주세요')
  }

  const data = (await res.json()) as CreatomateRender[] | CreatomateRender
  const render = Array.isArray(data) ? data[0] : data
  if (!render?.id) throw new Error('[APP] 영상 편집 요청에 실패했어요')

  return render.id
}
