import { fal } from '@fal-ai/client'

// fal.ai 이미지 생성 — 청소 포스팅용 대표 이미지 자동 생성
// 모델 선택:
//   - 'fal-ai/flux/schnell' : 1장당 약 $0.003 (₩4), 빠르지만 품질·프롬프트 반영 낮음
//   - 'fal-ai/flux/dev'     : 1장당 약 $0.025 (₩33), 품질·맥락 반영 우수 (마케팅 권장)
const IMAGE_MODEL = 'fal-ai/flux/dev'
const STEPS = IMAGE_MODEL.includes('schnell') ? 4 : 28

interface FalImage {
  url: string
  width: number
  height: number
  content_type: string
}

interface FalResult {
  images: FalImage[]
}

// 청소 업종 키워드 → 영문 장면 묘사 매핑 (Claude 없이도 맥락 맞춤 가능)
const SCENE_MAP: { kw: string[]; scene: string }[] = [
  { kw: ['에어컨', '냉방', '실외기'], scene: 'close-up of a spotless modern wall-mounted air conditioner being professionally cleaned indoors, sparkling clean cooling fins, water droplets' },
  { kw: ['이사', '입주', '이주', '새집'], scene: 'a bright empty freshly cleaned modern Korean apartment interior before move-in, warm sunlight through large windows, spotless glossy floor' },
  { kw: ['줄눈', '타일', '욕실', '화장실', '곰팡이'], scene: 'a sparkling clean modern bathroom with bright white tile grout, immaculate tiles, fresh and hygienic, soft daylight' },
  { kw: ['사무실', '오피스', '상가', '매장', '대규모'], scene: 'a clean modern office interior with polished reflective floor, tidy organized workspace, bright professional lighting' },
  { kw: ['마루', '바닥', '왁스', '원목'], scene: 'a glossy spotless hardwood floor in a bright modern living room, reflective surface, warm sunlight' },
  { kw: ['방충망', '창문', '유리', '샷시'], scene: 'a crystal clear clean window with spotless glass in a bright modern home, sunlight streaming through' },
  { kw: ['카펫', '소파', '매트리스', '침대'], scene: 'a freshly cleaned cozy sofa and carpet in a tidy modern living room, soft natural light' },
  { kw: ['주방', '싱크', '후드', '레인지'], scene: 'a sparkling clean modern kitchen with spotless countertops and shiny sink, bright daylight' },
]

const STYLE_SUFFIX =
  'photorealistic, professional commercial photography, natural soft daylight, ultra detailed, high resolution, clean and bright atmosphere, no text, no letters, no logo, no watermark'

// 글 맥락(제목 또는 Claude 힌트)을 받아 강한 영문 이미지 프롬프트로 변환
export function buildImagePrompt(seed: string): string {
  const trimmed = (seed ?? '').trim()
  const hasKorean = /[가-힣]/.test(trimmed)

  let subject: string
  if (!trimmed) {
    subject = 'a professional house cleaning result, spotless and tidy modern Korean home interior'
  } else if (hasKorean) {
    // 한국어 제목 → 키워드 매핑 (매칭 없으면 일반 청소 장면)
    const matched = SCENE_MAP.find((s) => s.kw.some((k) => trimmed.includes(k)))
    subject = matched?.scene ?? 'a professional house cleaning result, spotless and tidy modern Korean home interior, before and after clean look'
  } else {
    // 이미 영문 프롬프트면 그대로 사용
    subject = trimmed
  }

  return `${subject}, ${STYLE_SUFFIX}`
}

// seed(제목 또는 Claude imagePrompt) → 맥락 맞춤 이미지 1장 생성
// 실패해도 throw하지 않고 null 반환 (포스팅은 정상 진행)
export async function generatePostImage(seed: string): Promise<string | null> {
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    console.error('[Image] FAL_KEY 환경변수가 설정되지 않았습니다')
    return null
  }

  fal.config({ credentials: apiKey })
  const prompt = buildImagePrompt(seed)

  try {
    const result = await fal.subscribe(IMAGE_MODEL, {
      input: {
        prompt,
        image_size: 'landscape_4_3',
        num_images: 1,
        num_inference_steps: STEPS,
        guidance_scale: 3.5,
        enable_safety_checker: true,
      },
    }) as { data: FalResult }

    const url = result.data?.images?.[0]?.url
    if (!url) return null
    return url
  } catch (err) {
    // 이미지 생성 실패 시 포스팅은 정상 진행 (이미지만 없음)
    console.error('[Image] 이미지 생성 실패:', err instanceof Error ? err.message : err)
    return null
  }
}
