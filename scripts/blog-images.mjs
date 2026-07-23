// 블로그 이미지 로컬 생성기 (앱·DB·프로덕션과 완전 분리 — 로컬에서만 실행)
//
// 글(또는 주제)을 주면 전문가 데이터 기반으로 문단별 서로 다른 장면 이미지를
// 만들어 로컬 폴더에 저장한다. 자동 발행 파이프라인을 거치지 않으므로
// 사이트/메인에 아무것도 올라가지 않는다. (챌린지 콘텐츠 방해 없음)
//
// 사용법:
//   node scripts/blog-images.mjs --article 글.txt            (글 파일에서)
//   node scripts/blog-images.mjs --topic "울주군 에어컨 청소"   (주제 한 줄에서)
//   cat 글.txt | node scripts/blog-images.mjs                 (붙여넣기/파이프)
// 옵션:
//   --count 5     생성 장수 (기본 3, 최대 8)
//   --out DIR     저장 폴더 (기본 ~/Downloads/다트클린-블로그이미지/<제목>)
//   --title "제목" 폴더·파일명에 쓸 이름 (없으면 글에서 자동 추출)
//
// 사전 준비: .env.local 에 아래 두 줄이 있어야 함
//   ANTHROPIC_API_KEY=...   (이미 있음)
//   FAL_KEY=...             (fal.ai 대시보드 또는 Vercel 환경변수에서 복사)

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import nextEnv from '@next/env' // CommonJS 모듈 → default import 후 구조분해
import Anthropic from '@anthropic-ai/sdk'
import { fal } from '@fal-ai/client'

// .env.local 로드 (Next와 동일 규칙)
const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

// 이미지 스타일 수식어 — 청소 전문가가 실제로 작업하는 현장 느낌을 살리기 위해
// 사람/얼굴 억제 문구를 제거(예전엔 'no visible faces'가 있어 빈 공간만 나왔음).
const STYLE_SUFFIX =
  'Korean person, East Asian, set in a modern South Korean home interior, real professional cleaning-company equipment and tools clearly visible on site (industrial steam cleaner, electric pressure sprayer, wet/dry vacuum, chemical spray bottles, protective plastic sheeting), photorealistic, shot on a DSLR, authentic candid documentary service photography, natural soft daylight, ultra detailed, realistic skin texture, sharp focus, no text, no letters, no logo, no watermark'

// 모델 선택 (힉스필드보다 저렴한 선에서 사실감·한국인 인물 최적):
//   - 'bytedance/seedream/v5/pro/text-to-image' : 최신 최상급 사실감·한국인 인물, 1536px 장당 ₩91 (현재 사용)
//   - 'fal-ai/bytedance/seedream/v4/text-to-image' : 준수·장당 ₩40
//   - 'fal-ai/flux/dev'    : 인물 되지만 다소 서양적·일러스트풍, 장당 ₩33
//   - 'fal-ai/nano-banana' : '사람 등장' 장면 대부분 거부(422)
const IMAGE_MODEL = 'bytedance/seedream/v5/pro/text-to-image'
const IS_NANO = IMAGE_MODEL.includes('nano-banana')
const IS_SEEDREAM = IMAGE_MODEL.includes('seedream')

// 모델 계열별 입력 파라미터
function buildInput(prompt) {
  if (IS_NANO) {
    return { prompt, num_images: 1, aspect_ratio: '4:3', output_format: 'jpeg', safety_tolerance: '6' }
  }
  if (IS_SEEDREAM) {
    // 1536x1152(4:3) = 저가 구간($0.0675) 최고해상. 안전검사 off로 인물·장비 오탐 차단 완화
    return { prompt, image_size: { width: 1536, height: 1152 }, num_images: 1, output_format: 'jpeg', enable_safety_checker: false }
  }
  // Flux 계열 — 인물 오탐 차단을 줄이기 위해 안전검사 off
  return {
    prompt,
    image_size: 'landscape_4_3',
    num_images: 1,
    num_inference_steps: 28,
    guidance_scale: 3.5,
    enable_safety_checker: false,
    output_format: 'jpeg',
  }
}

// ---- 인자 파싱 -------------------------------------------------------------
function parseArgs(argv) {
  const args = { count: 3 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--article') args.article = argv[++i]
    else if (a === '--topic') args.topic = argv[++i]
    else if (a === '--count') args.count = parseInt(argv[++i], 10) || 3
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--title') args.title = argv[++i]
  }
  args.count = Math.max(1, Math.min(8, args.count))
  return args
}

// stdin(파이프/붙여넣기) 읽기
async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8').trim()
}

// 파일명에 못 쓰는 문자 정리
function safeName(s) {
  return (s || '').replace(/[\\/:*?"<>|\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
}

// ---- Claude로 문단별 장면 프롬프트 만들기 ----------------------------------
async function buildScenePrompts(anthropic, sourceText, count) {
  const prompt = `당신은 한국 청소 서비스 블로그의 이미지 디렉터입니다.
아래 글(또는 주제)에 넣을 서로 다른 사진 ${count}장의 영문 장면 묘사를 만드세요.

[글/주제]
${sourceText}

규칙:
- 정확히 ${count}개. 글의 서로 다른 부분(도입/문제/방법/결과/서비스 등)에 각각 어울리는 서로 다른 장면으로 — 같은 대상·같은 앵글 반복 금지
- ★대부분의 장면은 "청소 전문가가 실제로 작업하는 모습"을 담을 것. 유니폼/장갑 낀 청소 기사가 해당 대상(에어컨 내부/냉장고 뒷면/욕실 창틀 등)을 청소하는 역동적인 현장 컷. 손·도구·물방울이 보이면 좋다.
- ★★★실제 한국 청소업체가 쓰는 전문 장비를 장면에 반드시 구체적으로 등장시킬 것(두루뭉술 금지). 작업별로:
  · 에어컨 청소 = 벽걸이 에어컨을 분해하고 비닐 물받이 커버(cleaning cover funnel/plastic sheeting)를 두른 채, 전동 고압 분무기(electric pressure sprayer)나 스팀 세척기로 열교환기를 세척, 오수가 커버로 흘러내림
  · 욕실/줄눈/창틀 = 스팀 세척기(steam cleaner)·전동 브러시·약품 분무통
  · 냉장고 = 산업용 진공청소기(wet/dry vacuum)·극세사 천·브러시
  · 바닥에 양생(protective sheeting)·공구 케이스·약품통이 놓인 실제 작업 현장 느낌
- ★★반드시 "한국인(Korean)" 작업자로 명시하고, 배경도 한국식 가정/인테리어(Korean apartment/home)로 묘사할 것. 서양인·서양 주택이 나오지 않도록 각 장면 문장에 'Korean' 을 직접 넣을 것. 예: "a Korean cleaning professional in a company uniform and gloves scrubbing the heat exchanger fins inside an open wall-mounted air conditioner in a Korean apartment"
- 사람(작업자)을 반드시 등장시킬 것. 다만 정면 얼굴 초상 클로즈업은 피하고, 작업에 집중한 자연스러운 각도(측면·뒷모습·손 위주 클로즈업)로
- ${count}개 중 최대 1개 정도만 사람 없는 '깨끗해진 결과' 컷으로 넣어 변화를 줄 수 있음(나머지는 작업 현장 컷)
- ⚠️ 곰팡이·오염·벌레·세균 등 혐오/위험 소재를 직접 클로즈업하지 말 것(이미지 안전필터에 막힘). "전문 세척 작업 중" 또는 "깨끗해진" 상태로 표현
- 글자/간판/로고 없는 장면
- 각 1~2문장, 영문만. style 수식어는 시스템이 자동 추가하므로 장면만 묘사
- title 필드에는 이 글의 짧은 한국어 제목(폴더명용, 20자 이내)

아래 JSON으로만 응답:
{ "title": "...", "scenes": ["scene 1", "scene 2", ...] }`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('장면 프롬프트 JSON을 받지 못했습니다')
  const parsed = JSON.parse(match[0])
  const scenes = (parsed.scenes || []).map((s) => String(s).trim()).filter(Boolean).slice(0, count)
  if (scenes.length === 0) throw new Error('장면이 비어 있습니다')
  return { title: parsed.title || '', scenes }
}

// ---- fal nano-banana로 이미지 1장 생성 (실패 시 1회 재시도) ----------------
async function generateOne(scene) {
  const input = buildInput(`${scene}, ${STYLE_SUFFIX}`)
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fal.subscribe(IMAGE_MODEL, { input })
      const url = res?.data?.images?.[0]?.url
      if (url) return url
    } catch (err) {
      console.error(`  · 생성 실패(시도 ${attempt + 1}/2):`, err?.message || err)
    }
  }
  return null
}

async function download(url, filePath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`다운로드 실패 ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(filePath, buf)
}

// ---- 메인 ------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2))

  // 키 확인
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ .env.local 에 ANTHROPIC_API_KEY 가 없습니다.')
    process.exit(1)
  }
  if (!process.env.FAL_KEY) {
    console.error('❌ .env.local 에 FAL_KEY 가 없습니다.\n' +
      '   fal.ai 대시보드(또는 Vercel 프로젝트 환경변수)에서 값을 복사해\n' +
      '   프로젝트 루트 .env.local 파일에 다음 한 줄을 추가하세요:\n' +
      '     FAL_KEY=여기에_붙여넣기\n')
    process.exit(1)
  }
  fal.config({ credentials: process.env.FAL_KEY })

  // 소스 텍스트 확보
  let sourceText = ''
  if (args.article) sourceText = readFileSync(args.article, 'utf8').trim()
  else if (args.topic) sourceText = args.topic
  else sourceText = await readStdin()
  if (!sourceText) {
    console.error('❌ 글/주제가 없습니다. --article 글.txt 또는 --topic "주제" 또는 파이프로 입력하세요.')
    process.exit(1)
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const target = args.count
  console.log(`\n📝 전문가 데이터로 장면 구성 중... (요청 ${target}장 + 안전필터 대비 여유분)`)
  // 일부 장면이 이미지 안전필터에 막힐 수 있어 여유분(+2)을 미리 뽑아둔다
  const { title, scenes } = await buildScenePrompts(anthropic, sourceText, target + 2)
  const folderTitle = safeName(args.title || title) || `블로그이미지_${Date.now()}`

  const outDir = args.out || join(homedir(), 'Downloads', '다트클린-블로그이미지', folderTitle)
  mkdirSync(outDir, { recursive: true })

  console.log(`🎨 이미지 생성 중... (모델: ${IMAGE_MODEL})\n`)
  const saved = []
  for (let i = 0; i < scenes.length; i++) {
    if (saved.length >= target) break // 목표 장수를 채우면 중단(여유분은 사용 안 함)
    process.stdout.write(`  [${saved.length + 1}/${target}] ${scenes[i].slice(0, 60)}...\n`)
    const url = await generateOne(scenes[i])
    if (!url) { console.log('     → 안전필터/오류로 실패 → 다음 장면으로 대체') ; continue }
    const filePath = join(outDir, `${saved.length + 1}_${folderTitle}.jpg`)
    await download(url, filePath)
    saved.push(filePath)
    console.log('     → 저장 완료')
  }

  console.log(`\n✅ 완료: ${saved.length}/${target}장 저장`)
  console.log(`📂 폴더: ${outDir}`)
  console.log(`   (Finder에서 열기:  open "${outDir}" )\n`)
}

main().catch((err) => {
  console.error('\n❌ 오류:', err?.message || err)
  process.exit(1)
})
