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
  /** 업체 대표번호 — 마지막 화면에 띄운다. 없으면 안 띄운다 */
  businessPhone: string | null
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
  /**
   * 배경음악 주소. 없으면 안 깐다.
   * ⚠️ 반드시 저작권이 정리된 트랙이어야 한다 — 인스타·유튜브는 음원을 자동으로 식별해
   *    수익을 가져가거나 영상을 내린다. 아무 노래나 넣지 말 것.
   */
  musicUrl?: string | null
  webhookUrl: string
}

interface CreatomateRender {
  id: string
  status: string
  url?: string
  width?: number
  height?: number
}

const FONT = 'Gothic A1'
const STROKE = '#000000'
/** 강조 문장(첫 줄·마지막 줄) 색 — 나머지는 흰색 */
const EMPHASIS_COLOR = '#FFD60A'
/** 업체명 아웃트로 길이 */
const OUTRO_SECONDS = 2
/**
 * 배경음악 크기. Creatomate volume은 0~100 퍼센트 문자열이다.
 *
 * 실측(나레이션 위에 얹어 저음 에너지 증가분으로 비교):
 *   8% → +0.8dB (넣으나 마나) · 15% → +2.4dB (은은하게 깔림)
 *   22% → +4.1dB (또렷) · 30% → +5.9dB (앞으로 나옴)
 * 처음에 8%로 잡았는데 재보니 사실상 안 들려서 15%로 올렸다.
 * ⚠️22%를 넘기면 나레이션을 갉아먹는다 — 목소리가 안 들리면 영상을 만든 이유가 사라진다.
 */
const MUSIC_VOLUME = '15%'

type Element = Record<string, unknown>

/** 010-1234-5678 꼴로 끊어준다 — 붙어 있으면 화면에서 읽고 외우기 어렵다 */
function formatPhone(raw: string): string {
  const d = raw.replace(/[^0-9]/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 9 && d.startsWith('02')) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
  return raw.trim()
}

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
    // ⚠️x_anchor는 '상자'를 가운데로 옮길 뿐이고, 상자 안 글자는 기본이 왼쪽 정렬이다.
    //   글자를 가운데로 두려면 x_alignment가 따로 있어야 한다 —
    //   두 줄로 넘어가는 자막에서 왼쪽으로 쏠려 보이던 원인.
    x_alignment: '50%',
    text: cap.text,
    font_family: FONT,
    font_weight: '800',
    font_size: '6.6 vmin',
    fill_color: cap.emphasis ? EMPHASIS_COLOR : '#ffffff',
    // 밝은 벽·햇빛 든 창처럼 흰 배경 위에서도 읽히게 검은 테두리를 두른다.
    // 청소 현장은 흰 벽·흰 타일이 많아 테두리가 없으면 글자가 사라진다.
    stroke_color: STROKE,
    stroke_width: '1.3 vmin',
    // 테두리만으로 부족한 밝은 화면을 위해 옅은 그림자를 하나 더 깐다
    shadow_color: 'rgba(0,0,0,0.45)',
    shadow_blur: '1.6 vmin',
    shadow_y: '0.4 vmin',
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

  // ── 배경음악 — 목소리를 덮지 않게 아주 작게 깐다 ──
  // 나레이션이 주인공이라 비트는 '밑에 깔리는 맥박' 정도여야 한다.
  // 크게 넣으면 말이 안 들리고, 그러면 정보가 안 전달돼 영상을 만든 이유가 사라진다.
  const music: Element[] = input.musicUrl
    ? [{
        type: 'audio',
        track: 6,
        time: 0,
        duration: total,
        source: input.musicUrl,
        // 짧은 트랙이면 끝까지 반복해서 채운다
        loop: true,
        volume: MUSIC_VOLUME,
        // 끝에서 뚝 끊기면 어설프다 — 마지막 1초는 서서히 줄인다
        animations: [
          { time: 0, duration: 0.6, easing: 'linear', type: 'fade' },
          { time: total - 1, duration: 1, easing: 'linear', type: 'fade', reversed: true },
        ],
      }]
    : []

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

  // ── 마지막 화면 — 업체명 + 연락처 ────────────────────
  // 영상을 다 본 사람이 "그래서 어디로 연락하지?"에서 막히면 앞의 30초가 통째로 헛것이 된다.
  // ⚠️번호가 없는 업체도 있다 — 그때는 빈 자리를 만들지 말고 업체명만 가운데에 띄운다.
  const hasPhone = !!input.businessPhone?.trim()
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
      y: hasPhone ? '38%' : '46%',
      x_alignment: '50%',
      text: input.businessName,
      font_family: FONT,
      font_size: '9 vmin',
      font_weight: '900',
      fill_color: '#ffffff',
      animations: fadeIn,
    },
    ...(hasPhone
      ? [
          {
            type: 'text',
            track: 3,
            time: narrationEnd,
            duration: OUTRO_SECONDS,
            width: '90%',
            height: 'auto',
            x_anchor: '50%',
            y_anchor: '0%',
            y: '47%',
            x_alignment: '50%',
            text: '문의는 아래 연락처로 주세요',
            font_family: FONT,
            font_size: '4.2 vmin',
            font_weight: '700',
            fill_color: '#cbd5e1',
            animations: fadeIn,
          },
          {
            name: 'business-phone',
            type: 'text',
            track: 4,
            time: narrationEnd,
            duration: OUTRO_SECONDS,
            width: '90%',
            height: 'auto',
            x_anchor: '50%',
            y_anchor: '0%',
            y: '55%',
            x_alignment: '50%',
            text: formatPhone(input.businessPhone!),
            font_family: FONT,
            font_size: '8 vmin',
            font_weight: '900',
            fill_color: EMPHASIS_COLOR,
            // ⚠️letter_spacing은 vmin이 아니라 퍼센트만 받는다(글자 크기 대비).
            //   'vmin'을 넣었더니 렌더가 통째로 실패했다:
            //   "business-phone.letter_spacing: Expected a number ending with %"
            letter_spacing: '3%',
            animations: fadeIn,
          },
        ]
      : [
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
            x_alignment: '50%',
            text: '믿고 맡기는 깨끗함',
            font_family: FONT,
            font_size: '4.5 vmin',
            font_weight: '700',
            fill_color: '#19E68C',
            animations: fadeIn,
          },
        ]),
  ]

  const source = {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    duration: total,
    elements: [...visual, ...music, ...captions, ...audio, ...outro],
  }

  const res = await fetch('https://api.creatomate.com/v1/renders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source,
      webhook_url: input.webhookUrl,
      // ⚠️명시하지 않으면 계정 설정에 따라 축소돼 나온다 —
      //   실제로 1080×1920을 요청했는데 270×480(정확히 1/4)으로 나와 글자가 뭉개졌다.
      render_scale: 1,
      max_width: 1080,
      max_height: 1920,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[Creatomate] 렌더 요청 실패:', res.status, errText.slice(0, 500))
    throw new Error('[APP] 영상 편집 요청에 실패했어요. 잠시 후 다시 시도해주세요')
  }

  const data = (await res.json()) as CreatomateRender[] | CreatomateRender
  const render = Array.isArray(data) ? data[0] : data
  if (!render?.id) throw new Error('[APP] 영상 편집 요청에 실패했어요')

  // ⚠️응답을 통째로 남긴다. 요청은 1080×1920인데 결과물이 270×480(정확히 1/4)으로 나오는 원인을
  //   못 찾고 있다 — render_scale·max_width를 명시해도 그대로였다. 답은 이 응답 안에 있다.
  //   원인이 밝혀지면 이 로그는 크기 한 줄로 줄일 것.
  console.log(
    `[Creatomate] 렌더 요청 ${render.id} · 요청 ${source.width}×${source.height} · ${total}초`,
    '· 응답:', JSON.stringify(render).slice(0, 800),
  )

  return render.id
}
