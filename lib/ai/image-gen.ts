import { fal } from '@fal-ai/client'

// fal.ai Flux Schnell — 이미지 1장당 약 $0.003 (≈₩4)
// 청소 포스팅용 대표 이미지 자동 생성

interface FalImage {
  url: string
  width: number
  height: number
  content_type: string
}

interface FalResult {
  images: FalImage[]
}

export async function generatePostImage(imagePrompt: string): Promise<string | null> {
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    console.error('[Image] FAL_KEY 환경변수가 설정되지 않았습니다')
    return null
  }

  fal.config({ credentials: apiKey })

  try {
    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: `${imagePrompt}, photorealistic, professional commercial photography, clean bright lighting, high quality`,
        image_size: 'landscape_4_3',
        num_images: 1,
        num_inference_steps: 4,
        enable_safety_checker: true,
      },
    }) as { data: FalResult }

    const url = result.data?.images?.[0]?.url
    if (!url) return null

    return url
  } catch (err) {
    // 이미지 생성 실패 시 포스팅은 정상 진행 (이미지만 없음)
    console.error('[Image] Flux 이미지 생성 실패:', err instanceof Error ? err.message : err)
    return null
  }
}
