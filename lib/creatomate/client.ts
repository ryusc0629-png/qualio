interface ReelInput {
  beforePhotoUrl: string
  clipUrls: [string, string, string]
  afterPhotoUrl: string
  businessName: string
  beforeText: string
  webhookUrl: string
}

interface CreatomateRender {
  id: string
  status: string
  url?: string
}

export async function requestReelRender(input: ReelInput): Promise<string> {
  const apiKey = process.env.CREATOMATE_API_KEY
  if (!apiKey) throw new Error('[APP] 영상 편집 서비스가 설정되지 않았어요')

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
        y: '5%',
        text: '작업 전',
        font_size: '9 vmin',
        font_weight: '700',
        fill_color: '#ffffff',
        background_color: 'rgba(0,0,0,0.55)',
        x_padding: '6%',
        y_padding: '2.5%',
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
        font_size: '5 vmin',
        fill_color: '#ffffff',
        background_color: 'rgba(0,0,0,0.6)',
        x_padding: '4%',
        y_padding: '2%',
      },

      // ── 작업 중 영상 클립 1 (3~13초) ──────────────────
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

      // ── 작업 중 영상 클립 2 (13~23초) ─────────────────
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

      // ── 작업 중 영상 클립 3 (23~33초) ─────────────────
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

      // ── 작업 후 사진 (33~36초) ────────────────────────
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
        y_anchor: '50%',
        y: '50%',
        text: '깨끗하게 완료! ✨',
        font_size: '10 vmin',
        font_weight: '700',
        fill_color: '#ffffff',
        background_color: 'rgba(0,0,0,0.55)',
        x_padding: '6%',
        y_padding: '3%',
      },

      // ── 업체명 아웃트로 (36~38초) ─────────────────────
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
        y: '50%',
        text: input.businessName,
        font_size: '10 vmin',
        font_weight: '700',
        fill_color: '#ffffff',
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
