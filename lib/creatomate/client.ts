import type { ReelLine } from '@/lib/ai/reel-script'

// 릴스 합성 — 나레이션이 뼈대다.
//
// 예전 구조: 앞사진 3초 + 클립 10초×3 + 뒷사진 3초 + 아웃트로 2초(=38초), 소리 없음.
// 문제는 무음 상태로 화면이 10초씩 멈춰 있다는 것이었다. 거기서 시청자가 나간다.
// 지금 구조: 대본 문장 하나가 자막 한 줄이자 음성 한 마디이고, 화면 길이는 그 문장 길이를 따라간다.
// 컷 수를 늘리지 않아도 되는 이유는 목소리가 계속 정보를 밀어주기 때문이다.

interface ReelInput {
  beforePhotoUrl: string
  clipUrls: [string, string, string]
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

/** 화면 구간 — 무엇을 띄우고, 어떤 문장들이 그 위에 올라가는지 */
export interface Segment {
  start: number
  duration: number
  lines: { line: ReelLine; start: number }[]
}

/**
 * 대본을 화면 5개(앞사진 · 클립3 · 뒷사진)에 나눠 붙인다.
 *
 * 첫 문장은 작업 전 사진 위에, 마지막 문장은 작업 후 사진 위에.
 * 가운데 문장들은 클립 3개에 고르게 나눈다. 화면 길이는 문장 길이의 합이라
 * 대본이 길면 화면도 같이 길어진다(=자막이 잘리지 않는다).
 */
export function planSegments(lines: ReelLine[]): Segment[] {
  // 최소 5문장은 보장되지만(대본 생성 쪽에서 걸러진다) 방어적으로 처리
  const first = lines.slice(0, 1)
  const last = lines.length >= 3 ? lines.slice(-1) : []
  const middle = lines.slice(first.length, lines.length - last.length)

  // 가운데 문장을 클립 3개에 앞에서부터 순서대로 나눠 담는다.
  // (번갈아 담으면 말 순서가 섞여 화면과 대본이 어긋난다)
  const perClip = Math.ceil(middle.length / 3)
  const buckets: ReelLine[][] = [
    middle.slice(0, perClip),
    middle.slice(perClip, perClip * 2),
    middle.slice(perClip * 2),
  ]

  const groups = [first, ...buckets, last]
  const segments: Segment[] = []
  let cursor = 0

  for (const group of groups) {
    // 문장이 하나도 안 배정된 화면은 최소 시간만 준다 (사진이 깜빡이고 지나가지 않게)
    const duration = group.length > 0 ? group.reduce((s, l) => s + l.seconds, 0) : 1.5
    let lineCursor = cursor
    const placed = group.map((line) => {
      const at = lineCursor
      lineCursor += line.seconds
      return { line, start: at }
    })
    segments.push({ start: cursor, duration, lines: placed })
    cursor += duration
  }

  return segments
}

/** 자막 한 줄 — 화면 가운데, 한 줄, 흰색(강조는 노랑) */
function captionElement(line: ReelLine, start: number): Element {
  return {
    type: 'text',
    track: 3,
    time: start,
    duration: line.seconds,
    width: '86%',
    height: 'auto',
    x_anchor: '50%',
    y_anchor: '50%',
    y: '50%',
    text: line.text,
    font_family: FONT,
    font_weight: '800',
    font_size: '6.2 vmin',
    fill_color: line.emphasis ? EMPHASIS_COLOR : '#ffffff',
    stroke_color: STROKE,
    stroke_width: '1.1 vmin',
    line_height: '135%',
    animations: [{ time: 0, duration: 0.25, easing: 'quadratic-out', type: 'fade' }],
  }
}

export async function requestReelRender(input: ReelInput): Promise<string> {
  const apiKey = process.env.CREATOMATE_API_KEY
  if (!apiKey) throw new Error('[APP] 영상 편집 서비스가 설정되지 않았어요')

  const fadeIn = [{ time: 0, duration: 0.4, easing: 'quadratic-out', type: 'fade' }]
  const segments = planSegments(input.lines)
  const [beforeSeg, clip1, clip2, clip3, afterSeg] = segments
  const narrationEnd = segments.reduce((s, seg) => s + seg.duration, 0)
  const total = Math.round((narrationEnd + OUTRO_SECONDS) * 10) / 10

  const visual: Element[] = [
    // ── 작업 전 사진 ────────────────────────────────────
    {
      name: 'before-photo',
      type: 'image',
      track: 1,
      time: beforeSeg.start,
      duration: beforeSeg.duration,
      width: '100%',
      height: '100%',
      x_anchor: '50%',
      y_anchor: '50%',
      fit: 'cover',
      source: input.beforePhotoUrl,
    },
    // ── 작업 중 영상 클립 3개 ───────────────────────────
    ...[clip1, clip2, clip3].map((seg, i) => ({
      name: `clip-${i + 1}`,
      type: 'video',
      track: 1,
      time: seg.start,
      duration: seg.duration,
      width: '100%',
      height: '100%',
      x_anchor: '50%',
      y_anchor: '50%',
      fit: 'cover',
      // 나레이션이 주인공이라 현장 소리는 배경으로만 깔린다
      volume: 0.12,
      source: input.clipUrls[i],
    })),
    // ── 작업 후 사진 ────────────────────────────────────
    {
      name: 'after-photo',
      type: 'image',
      track: 1,
      time: afterSeg.start,
      duration: afterSeg.duration,
      width: '100%',
      height: '100%',
      x_anchor: '50%',
      y_anchor: '50%',
      fit: 'cover',
      source: input.afterPhotoUrl,
    },
  ]

  // ── 자막 — 대본 문장 그대로 ───────────────────────────
  const captions: Element[] = segments.flatMap((seg) =>
    seg.lines.map(({ line, start }) => captionElement(line, start)),
  )

  // ── 나레이션 음성 — 문장마다 그 자막이 뜨는 시각에 정확히 얹는다 ──
  // 통 파일 하나로 깔면 자막과 조금씩 어긋나는데, 문장별로 놓으면 어긋날 수가 없다.
  const spoken = segments.flatMap((seg) => seg.lines)
  const audio: Element[] = input.narrationUrls.length === spoken.length
    ? spoken.map(({ line, start }, i) => ({
        type: 'audio',
        track: 5,
        time: start,
        duration: line.seconds,
        source: input.narrationUrls[i],
      }))
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
