import { fal } from '@fal-ai/client'

// fal.ai 이미지 생성 — 청소 포스팅용 대표 이미지 자동 생성
//
// ⚠️⚠️ 현재 자동 이미지 생성 OFF (2026-07-23) — 사장님 요청으로 퀄리오 자동 발행은 '텍스트만'.
//   이미지는 당분간 로컬 스크립트(scripts/blog-images.mjs)로 직접 만들어 수동 첨부.
//   ▶ 나중에 이미지 기능을 다시 켤 때: 아래 IMAGE_GENERATION_ENABLED 를 true 로만 바꾸면 됨.
//     (모델·프롬프트는 이미 '승리 조합'인 Seedream V5 Pro + 한국·장비 프롬프트로 배선돼 있음)
const IMAGE_GENERATION_ENABLED = false
//
// 모델 선택 (승리 조합 = Seedream V5 Pro, 재검증 결과):
//   - 'bytedance/seedream/v5/pro/text-to-image' : 한국인 인물·실제 청소장비·포토리얼리즘 최상, 1536px 장당 ₩91 (현재 배선)
//   - 'fal-ai/bytedance/seedream/v4/text-to-image' : 준수, 장당 ₩40
//   - 'fal-ai/flux/dev'    : 인물 되지만 다소 서양적, 장당 ₩33
//   - 'fal-ai/nano-banana' : 사실적이나 '사람 등장' 장면 대부분 거부(422)
// 타입을 string으로 두어 fal이 모델별 입력 타입으로 좁히지 않게 함 (모델별 입력은 buildModelInput에서 분기)
const IMAGE_MODEL: string = 'bytedance/seedream/v5/pro/text-to-image'
const IS_NANO = IMAGE_MODEL.includes('nano-banana')
const IS_SEEDREAM = IMAGE_MODEL.includes('seedream')
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

// 승리 조합 스타일 수식어 — 한국인 작업자 + 실제 청소업체 장비가 보이는 현장 톤
// (예전의 'no visible faces'는 빈 공간만 나오게 해서 제거함)
const STYLE_SUFFIX =
  'Korean person, East Asian, set in a modern South Korean home interior, real professional cleaning-company equipment and tools clearly visible on site (industrial steam cleaner, electric pressure sprayer, wet/dry vacuum, chemical spray bottles, protective plastic sheeting), photorealistic, shot on a DSLR, authentic candid documentary service photography, natural soft daylight, ultra detailed, realistic skin texture, sharp focus, no text, no letters, no logo, no watermark'

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

// 모델 계열별 입력 파라미터
function buildModelInput(prompt: string): Record<string, unknown> {
  if (IS_SEEDREAM) {
    // 1536x1152(4:3) = 저가 구간($0.0675) 최고 해상. 안전검사 off로 인물·장비 오탐 완화
    return { prompt, image_size: { width: 1536, height: 1152 }, num_images: 1, output_format: 'jpeg', enable_safety_checker: false }
  }
  if (IS_NANO) {
    return {
      prompt,
      num_images: 1,
      aspect_ratio: '4:3', // Flux의 landscape_4_3과 동일한 가로 비율
      output_format: 'jpeg', // 블로그 업로드용 경량 포맷
      // nano-banana(Gemini)가 무해한 장면까지 과도하게 거부(422)해 이미지가 누락되는 문제 방지.
      // 6 = 가장 느슨한 안전 허용도. 로컬 테스트에서 실패율 ~50% → 0%로 개선 확인.
      safety_tolerance: '6',
    }
  }
  return {
    prompt,
    image_size: 'landscape_4_3',
    num_images: 1,
    num_inference_steps: STEPS,
    guidance_scale: 3.5,
    enable_safety_checker: true,
  }
}

async function runImageModel(prompt: string): Promise<string | null> {
  try {
    const result = await fal.subscribe(IMAGE_MODEL, {
      input: buildModelInput(prompt),
    }) as { data: FalResult }
    return result.data?.images?.[0]?.url ?? null
  } catch (err) {
    console.error('[Image] 이미지 생성 실패:', err instanceof Error ? err.message : err)
    return null
  }
}

// 실패(안전필터·일시 오류 등) 시 1회 더 시도 — 한 장씩 조용히 누락돼 "1장만" 나오는 문제 완화
async function runImageModelWithRetry(prompt: string, retries = 1): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const url = await runImageModel(prompt)
    if (url) return url
  }
  return null
}

// seed(제목 또는 Claude imagePrompt) → 맥락 맞춤 이미지 1장 생성
// 실패해도 throw하지 않고 null 반환 (포스팅은 정상 진행)
export async function generatePostImage(seed: string): Promise<string | null> {
  if (!IMAGE_GENERATION_ENABLED) return null // 자동 이미지 OFF (플래그로 재활성화)
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    console.error('[Image] FAL_KEY 환경변수가 설정되지 않았습니다')
    return null
  }
  fal.config({ credentials: apiKey })
  return runImageModelWithRetry(buildImagePrompt(seed))
}

// seed → 맥락 맞춤 이미지 count장 생성 (작업/결과/디테일 등 서로 다른 장면)
// 네이버 상위노출용 다중 이미지. 실패한 장은 제외하고 성공한 URL 배열만 반환.
export async function generatePostImages(seed: string, count: number): Promise<string[]> {
  if (!IMAGE_GENERATION_ENABLED) return [] // 자동 이미지 OFF (플래그로 재활성화)
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

  const results = await Promise.all(prompts.map((p) => runImageModelWithRetry(p)))
  return results.filter((u): u is string => Boolean(u))
}

// Claude가 소제목별로 만든 '서로 다른 장면' 프롬프트 배열로 각각 1장씩 생성.
// 단일 장면을 샷 타입만 바꿔 복제하던 방식과 달리, 글 문단마다 맥락이 다른 사진이 나온다.
async function generateFromDistinctPrompts(prompts: string[], count: number): Promise<string[]> {
  const chosen = prompts.slice(0, Math.max(1, count))
  const results = await Promise.all(
    // 스타일 수식어만 붙이고 장면은 Claude가 준 그대로 사용
    chosen.map((p) => runImageModelWithRetry(`${p}, ${STYLE_SUFFIX}`)),
  )
  return results.filter((u): u is string => Boolean(u))
}

// 포스트 이미지 생성 진입점 — 소제목별 다중 프롬프트가 있으면 그걸로(맥락 정확),
// 없으면 단일 seed 기반 변형 생성으로 폴백(구버전 호환).
export async function generatePostImagesSmart(
  prompts: string[] | null | undefined,
  fallbackSeed: string,
  count: number,
): Promise<string[]> {
  if (!IMAGE_GENERATION_ENABLED) return [] // 자동 이미지 OFF (플래그로 재활성화)
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    console.error('[Image] FAL_KEY 환경변수가 설정되지 않았습니다')
    return []
  }
  fal.config({ credentials: apiKey })

  const distinct = (prompts ?? []).map((p) => (p ?? '').trim()).filter(Boolean)
  if (distinct.length >= 2) {
    return generateFromDistinctPrompts(distinct, count)
  }
  // 프롬프트가 부족하면(구버전·파싱 실패) 기존 변형 방식으로
  return generatePostImages(distinct[0] || fallbackSeed, count)
}
