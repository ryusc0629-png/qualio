import type { ReelCaption } from '@/lib/ai/reel-captions'

interface ReelInput {
  beforePhotoUrl: string
  clipUrls: [string, string, string]
  afterPhotoUrl: string
  businessName: string
  beforeText: string
  captions: ReelCaption[]
  webhookUrl: string
}

interface CreatomateRender {
  id: string
  status: string
  url?: string
}

// ── 바이럴 릴스 자막 디자인 상수 ──────────────────────────
// 검증된 고조회수 숏폼 자막: 흰색 본문 + 두꺼운 검정 외곽선 + 고정 강조색
const FONT = 'Gothic A1' // 깔끔한 한글 고딕 (Google Fonts)
const STROKE = '#000000'
// tone별 강조색 (고정) — 노랑=주목, 초록=결과, 빨강=문제
const TONE_COLOR: Record<ReelCaption['tone'], string> = {
  problem: '#FF453A',
  action: '#FFD60A',
  result: '#19E68C',
}

type Element = Record<string, unknown>

// 자막 한 컷 = 흰색 설정줄(top) + 강조색 펀치줄(bottom), 둘 다 페이드 인
function buildCaptionElements(captions: ReelCaption[]): Element[] {
  if (captions.length === 0) return []
  const total = 30 // 클립 구간 3~33초
  const seg = total / captions.length

  return captions.flatMap((cap, i): Element[] => {
    const time = 3 + i * seg
    const color = TONE_COLOR[cap.tone] ?? TONE_COLOR.action
    const fadeIn = [{ time: 0, duration: 0.3, easing: 'quadratic-out', type: 'fade' }]

    return [
      // 설정줄 (흰색)
      {
        type: 'text',
        track: 3,
        time,
        duration: seg,
        width: '90%',
        height: 'auto',
        x_anchor: '50%',
        y_anchor: '100%',
        y: '62%',
        text: cap.top,
        font_family: FONT,
        font_weight: '800',
        font_size: '6.5 vmin',
        fill_color: '#ffffff',
        stroke_color: STROKE,
        stroke_width: '1.2 vmin',
        animations: fadeIn,
      },
      // 펀치줄 (강조색, 더 크게)
      {
        type: 'text',
        track: 4,
        time,
        duration: seg,
        width: '92%',
        height: 'auto',
        x_anchor: '50%',
        y_anchor: '0%',
        y: '63.5%',
        text: cap.bottom,
        font_family: FONT,
        font_weight: '900',
        font_size: '9.5 vmin',
        fill_color: color,
        stroke_color: STROKE,
        stroke_width: '1.5 vmin',
        animations: fadeIn,
      },
    ]
  })
}

export async function requestReelRender(input: ReelInput): Promise<string> {
  const apiKey = process.env.CREATOMATE_API_KEY
  if (!apiKey) throw new Error('[APP] 영상 편집 서비스가 설정되지 않았어요')

  const fadeIn = [{ time: 0, duration: 0.4, easing: 'quadratic-out', type: 'fade' }]

  const source = {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    duration: 38,
    elements: [
      // ── 작업 전 사진 (0~3초) ───────────────────────────
      {
        name: 'before-photo',
        type: 'image',
        track: 1,
        time: 0,
        duration: 3,
        width: '100%',
        height: '100%',
        x_anchor: '50%',
        y_anchor: '50%',
        fit: 'cover',
        source: input.beforePhotoUrl,
      },
      {
        type: 'text',
        track: 2,
        time: 0,
        duration: 3,
        width: '100%',
        height: 'auto',
        x_anchor: '50%',
        y_anchor: '0%',
        y: '6%',
        text: 'BEFORE',
        font_family: FONT,
        font_size: '8 vmin',
        font_weight: '900',
        fill_color: '#ffffff',
        stroke_color: STROKE,
        stroke_width: '1.2 vmin',
        letter_spacing: '0.5 vmin',
        animations: fadeIn,
      },
      {
        type: 'text',
        track: 3,
        time: 0,
        duration: 3,
        width: '88%',
        height: 'auto',
        x_anchor: '50%',
        y_anchor: '100%',
        y: '92%',
        text: input.beforeText,
        font_family: FONT,
        font_weight: '700',
        font_size: '5 vmin',
        fill_color: '#ffffff',
        stroke_color: STROKE,
        stroke_width: '1 vmin',
        animations: fadeIn,
      },

      // ── 작업 중 영상 클립 (3~33초) ──────────────────────
      {
        name: 'clip-1',
        type: 'video',
        track: 1,
        time: 3,
        duration: 10,
        width: '100%',
        height: '100%',
        x_anchor: '50%',
        y_anchor: '50%',
        fit: 'cover',
        volume: 0.4,
        source: input.clipUrls[0],
      },
      {
        name: 'clip-2',
        type: 'video',
        track: 1,
        time: 13,
        duration: 10,
        width: '100%',
        height: '100%',
        x_anchor: '50%',
        y_anchor: '50%',
        fit: 'cover',
        volume: 0.4,
        source: input.clipUrls[1],
      },
      {
        name: 'clip-3',
        type: 'video',
        track: 1,
        time: 23,
        duration: 10,
        width: '100%',
        height: '100%',
        x_anchor: '50%',
        y_anchor: '50%',
        fit: 'cover',
        volume: 0.4,
        source: input.clipUrls[2],
      },

      // ── 클립 위 순차 자막 (3~33초) ──────────────────────
      ...buildCaptionElements(input.captions),

      // ── 작업 후 사진 (33~36초) ──────────────────────────
      {
        name: 'after-photo',
        type: 'image',
        track: 1,
        time: 33,
        duration: 3,
        width: '100%',
        height: '100%',
        x_anchor: '50%',
        y_anchor: '50%',
        fit: 'cover',
        source: input.afterPhotoUrl,
      },
      {
        type: 'text',
        track: 2,
        time: 33,
        duration: 3,
        width: '100%',
        height: 'auto',
        x_anchor: '50%',
        y_anchor: '0%',
        y: '6%',
        text: 'AFTER',
        font_family: FONT,
        font_size: '8 vmin',
        font_weight: '900',
        fill_color: '#19E68C',
        stroke_color: STROKE,
        stroke_width: '1.2 vmin',
        letter_spacing: '0.5 vmin',
        animations: fadeIn,
      },
      {
        type: 'text',
        track: 3,
        time: 33,
        duration: 3,
        width: '90%',
        height: 'auto',
        x_anchor: '50%',
        y_anchor: '50%',
        y: '50%',
        text: '깨끗하게 완료!',
        font_family: FONT,
        font_size: '11 vmin',
        font_weight: '900',
        fill_color: '#ffffff',
        stroke_color: STROKE,
        stroke_width: '1.6 vmin',
        animations: [
          { time: 0, duration: 0.4, easing: 'back-out', type: 'scale' },
          { time: 0, duration: 0.3, easing: 'quadratic-out', type: 'fade' },
        ],
      },

      // ── 업체명 아웃트로 (36~38초) ───────────────────────
      {
        type: 'shape',
        track: 1,
        time: 36,
        duration: 2,
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
        time: 36,
        duration: 2,
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
        time: 36,
        duration: 2,
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
    ],
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
    const errorText = await res.text()
    console.error('[Creatomate] 렌더 요청 실패:', errorText)
    throw new Error('[APP] 영상 편집 요청에 실패했어요')
  }

  const renders = await res.json() as CreatomateRender[]
  const render = renders[0]
  if (!render?.id) throw new Error('[APP] 영상 편집 요청 응답이 올바르지 않아요')

  return render.id
}
