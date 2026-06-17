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

  const templateId = process.env.CREATOMATE_TEMPLATE_ID
  if (!templateId) throw new Error('[APP] 영상 템플릿이 설정되지 않았어요')

  const res = await fetch('https://api.creatomate.com/v1/renders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_id: templateId,
      webhook_url: input.webhookUrl,
      modifications: {
        'before-photo': input.beforePhotoUrl,
        'clip-1': input.clipUrls[0],
        'clip-2': input.clipUrls[1],
        'clip-3': input.clipUrls[2],
        'after-photo': input.afterPhotoUrl,
        'business-name': input.businessName,
        'before-text': input.beforeText,
      },
    }),
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
