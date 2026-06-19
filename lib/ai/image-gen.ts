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

// 청소 업종 키워드 → 대상(subject)·공간(space)·규모(scale) 매핑.
// 한 주제에서 '작업 / 결과 / 디테일' 3종의 서로 다른 장면을 만들기 위한 재료.
// scale=object → 작업 컷은 장갑 낀 손 클로즈업 / scale=room → 뒷모습 작업자.
type SubjectInfo = { subject: string; space: string; scale: 'object' | 'room' }

const SUBJECT_MAP: { kw: string[]; info: SubjectInfo }[] = [
  { kw: ['에어컨', '냉방', '실외기'], info: { subject: 'modern wall-mounted air conditioner', space: 'bright clean living room', scale: 'object' } },
  { kw: ['이사', '입주', '이주', '새집'], info: { subject: 'glossy apartment floor', space: 'bright empty freshly cleaned Korean apartment before move-in', scale: 'room' } },
  { kw: ['줄눈', '타일', '욕실', '화장실', '곰팡이'], info: { subject: 'white bathroom tile and grout', space: 'sparkling clean modern bathroom', scale: 'object' } },
  { kw: ['사무실', '오피스', '상가', '매장', '대규모'], info: { subject: 'polished office floor', space: 'bright modern open-plan office', scale: 'room' } },
  { kw: ['마루', '바닥', '왁스', '원목'], info: { subject: 'glossy hardwood floor', space: 'bright modern living room', scale: 'room' } },
  { kw: ['방충망', '창문', '유리', '샷시'], info: { subject: 'crystal clear window glass', space: 'bright modern home', scale: 'object' } },
  { kw: ['카펫', '소파', '매트리스', '침대'], info: { subject: 'fabric sofa and carpet', space: 'cozy tidy modern living room', scale: 'room' } },
  { kw: ['주방', '싱크', '후드', '레인지'], info: { subject: 'kitchen countertop and sink', space: 'spotless modern kitchen', scale: 'object' } },
]

const FALLBACK: SubjectInfo = { subject: 'home surfaces', space: 'spotless tidy modern Korean home interior', scale: 'room' }

const STYLE_SUFFIX =
  'photorealistic, candid professional commercial photography, natural soft daylight, ultra detailed, high resolution, clean and bright atmosphere, no visible faces, no close-up of faces, no text, no letters, no logo, no watermark'

// 한 주제에서 서로 다른 3종 이상의 장면(작업/결과/디테일/와이드)을 생성
function sceneVariants(info: SubjectInfo): string[] {
  const work = info.scale === 'object'
    ? `gloved hands of a professional cleaner cleaning a ${info.subject}, close-up on hands and equipment, water droplets`
    : `a professional cleaner seen from behind cleaning the ${info.subject} of a ${info.space}, full back view`
  return [
    work, // 1) 작업 컷
    `a spotless freshly cleaned ${info.space}, immaculate and bright, no person, interior photography`, // 2) 결과 컷 (사람 없음)
    `extreme macro close-up of a sparkling clean ${info.subject}, fine detail, water droplets, no person`, // 3) 디테일 매크로
    `wide angle shot of a bright tidy ${info.space} after professional cleaning, no person`, // 4) 와이드 (추가분)
  ]
}

// seed → 서로 다른 장면 프롬프트 배열 (스타일 수식어 포함)
// Claude imagePrompt(영문 장면 묘사)가 들어오면 그 맥락 그대로 사용 → 샷 타입만 변형
// 한국어 제목이 들어오면 키워드 매칭 → SUBJECT_MAP 기반 장면 생성
function buildVariantPrompts(seed: string): string[] {
  const trimmed = (seed ?? '').trim()
  const hasKorean = /[가-힣]/.test(trimmed)

  let scenes: string[]
  if (trimmed && !hasKorean) {
    // 영문 seed(Claude imagePrompt): 글 맥락 기반으로 샷 타입만 다르게
    // Claude가 이미 주제에 맞는 구체적 장면을 묘사했으므로 최대한 살림
    scenes = [
      trimmed, // 1) 원본 장면 그대로
      `wide-angle result shot: ${trimmed}, clean and bright, no person, interior photography`, // 2) 결과 와이드
      `extreme macro close-up detail of the main subject in: ${trimmed}, fine texture detail, no person`, // 3) 디테일 매크로
      `alternative angle of: ${trimmed}, different perspective, bright atmosphere, no person`, // 4) 다른 앵글
    ]
  } else {
    // 한국어 제목 → 키워드 매칭으로 장면 생성
    const matched = trimmed ? SUBJECT_MAP.find((s) => s.kw.some((k) => trimmed.includes(k))) : undefined
    scenes = sceneVariants(matched?.info ?? FALLBACK)
  }
  return scenes.map((s) => `${s}, ${STYLE_SUFFIX}`)
}

// 글 맥락(제목/힌트) → 대표 이미지 1장용 프롬프트 (작업 컷)
export function buildImagePrompt(seed: string): string {
  return buildVariantPrompts(seed)[0]
}

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

// seed → 맥락 맞춤 이미지 count장 생성 (작업/결과/디테일 등 서로 다른 장면)
// 네이버 상위노출용 다중 이미지. 실패한 장은 제외하고 성공한 URL 배열만 반환.
export async function generatePostImages(seed: string, count: number): Promise<string[]> {
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    console.error('[Image] FAL_KEY 환경변수가 설정되지 않았습니다')
    return []
  }
  fal.config({ credentials: apiKey })

  const variants = buildVariantPrompts(seed)
  const n = Math.max(1, count)
  // 변형 개수보다 많이 요청하면 순환하되 다른 앵글을 덧붙여 중복 회피
  const prompts = Array.from({ length: n }, (_, i) =>
    i < variants.length ? variants[i] : `${variants[i % variants.length]}, alternative angle ${i}`,
  )

  const results = await Promise.all(prompts.map((p) => runFlux(p)))
  return results.filter((u): u is string => Boolean(u))
}
