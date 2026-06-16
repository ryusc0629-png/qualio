import { fal } from '@fal-ai/client'

// fal.ai 이미지 생성 — 청소 포스팅용 대표 이미지 자동 생성
// 모델 선택:
//   - 'fal-ai/flux/schnell' : 1장당 약 $0.003 (₩4), 빠르지만 품질·프롬프트 반영 낮음
//   - 'fal-ai/flux/dev'     : 1장당 약 $0.025 (₩33), 품질·맥락 반영 우수 (마케팅 권장)
const IMAGE_MODEL = 'fal-ai/flux/dev'
const STEPS = IMAGE_MODEL.includes('schnell') ? 4 : 28

// 포스트당 생성할 이미지 수 (네이버 상위노출 균형점: 대표 1 + 본문용 2)
export const POST_IMAGE_COUNT = 3

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
// 신뢰감을 위해 '작업하는 손/뒷모습'을 넣되, 얼굴은 노출하지 않는다(진정성·왜곡 리스크 회피).
const SCENE_MAP: { kw: string[]; scene: string }[] = [
  { kw: ['에어컨', '냉방', '실외기'], scene: 'gloved hands of a professional cleaner wiping a spotless modern wall-mounted air conditioner indoors, close-up on hands and equipment, sparkling clean cooling fins, water droplets' },
  { kw: ['이사', '입주', '이주', '새집'], scene: 'a professional cleaner seen from behind mopping the glossy floor of a bright freshly cleaned empty Korean apartment before move-in, full back view, warm sunlight through large windows' },
  { kw: ['줄눈', '타일', '욕실', '화장실', '곰팡이'], scene: 'gloved hands scrubbing bright white tile grout in a sparkling clean modern bathroom, close-up on hands and brush, immaculate tiles, fresh and hygienic' },
  { kw: ['사무실', '오피스', '상가', '매장', '대규모'], scene: 'a professional cleaner seen from behind cleaning the polished reflective floor of a bright modern office, full back view, tidy organized workspace' },
  { kw: ['마루', '바닥', '왁스', '원목'], scene: 'gloved hands polishing a glossy spotless hardwood floor in a bright modern living room, close-up on hands and cloth, reflective surface, warm sunlight' },
  { kw: ['방충망', '창문', '유리', '샷시'], scene: 'gloved hands wiping a crystal clear spotless window with a squeegee in a bright modern home, close-up on hands, sunlight streaming through' },
  { kw: ['카펫', '소파', '매트리스', '침대'], scene: 'a professional cleaner seen from behind vacuuming a cozy sofa and carpet in a tidy modern living room, full back view, soft natural light' },
  { kw: ['주방', '싱크', '후드', '레인지'], scene: 'gloved hands wiping a spotless modern kitchen countertop with a cloth, close-up on hands, shiny sink, bright daylight' },
]

const STYLE_SUFFIX =
  'photorealistic, candid professional commercial photography, natural soft daylight, ultra detailed, high resolution, clean and bright atmosphere, no visible faces, no close-up of faces, no text, no letters, no logo, no watermark'

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

// 여러 장 생성 시 서로 다른 앵글로 다양성 확보 (네이버 본문 삽입용)
const ANGLE_VARIANTS = [
  '', // 0: 기본 (작업 손/뒷모습 컷)
  ', wide establishing shot of the clean bright space, result focused',
  ', extreme close-up detail of the spotless cleaned surface',
  ', slightly different angle, soft depth of field',
  ', overhead top-down view of the tidy clean area',
]

async function runFlux(prompt: string): Promise<string | null> {
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
    return result.data?.images?.[0]?.url ?? null
  } catch (err) {
    console.error('[Image] 이미지 생성 실패:', err instanceof Error ? err.message : err)
    return null
  }
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
  return runFlux(buildImagePrompt(seed))
}

// seed → 맥락 맞춤 이미지 count장 생성 (앵글을 달리해 다양성 확보)
// 네이버 상위노출용 다중 이미지. 실패한 장은 제외하고 성공한 URL 배열만 반환.
export async function generatePostImages(seed: string, count: number): Promise<string[]> {
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    console.error('[Image] FAL_KEY 환경변수가 설정되지 않았습니다')
    return []
  }
  fal.config({ credentials: apiKey })

  const base = buildImagePrompt(seed)
  const n = Math.max(1, Math.min(count, ANGLE_VARIANTS.length))
  const prompts = Array.from({ length: n }, (_, i) => base + ANGLE_VARIANTS[i])

  const results = await Promise.all(prompts.map((p) => runFlux(p)))
  return results.filter((u): u is string => Boolean(u))
}
