import { getClaude, textFrom } from '@/lib/ai/client'

// 릴스 나레이션 대본 — 한 줄이 곧 한 문장이고, 그대로 자막이자 음성이 된다.
//
// 왜 이렇게 바꿨나: 예전 자막은 "오늘의 현장 / 상태부터 확인" 같은 분위기 문구였다.
// 정보가 없으니 저장도 공유도 안 되고 그냥 스쳐 지나갔다. 조회수가 잘 나오는 청소 릴스를
// 뜯어보니 화면이 예뻐서가 아니라 대본이 정보를 실어 나르기 때문이었다(32초에 컷 5개뿐인데도 버틴다).
// 그래서 자막을 '문구'가 아니라 '나레이션'으로 바꾼다.
//
// ⚠️ 재료는 오늘 작업 보고서에 실제로 적힌 것만 쓴다. 없는 사실을 지어내면
// 그 영상은 고객이 보는 광고라 그대로 거짓말이 된다.

export interface ReelLine {
  /** 화면에 뜨고 음성으로 읽히는 한 문장 */
  text: string
  /** 이 문장에 줄 시간(초) — 글자 수에서 계산한다 */
  seconds: number
  /** 강조 문장이면 자막을 노란색으로 (첫 후킹 문장과 마지막 문장) */
  emphasis: boolean
}

export interface ReelScriptInput {
  cleaningType: string
  /** 작업 전 상태 (ai_report_data.beforeStatus 또는 예약 메모) */
  beforeStatus: string
  /** 작업 내용 */
  workDetails: string
  /** 작업 결과 */
  afterResult: string
  /** 하자·특이사항 — 현장에서만 알 수 있는 것이라 신뢰의 근거가 된다 */
  siteNote: string
  /** 앞으로 손봐야 할 것 — 시청자가 가져갈 '팁'이 여기서 가장 잘 나온다 */
  careAdvice: string
}

// 음성 합성이 실패했을 때만 쓰는 추정치다. 평소엔 합성된 mp3의 실제 길이를 쓴다.
// 8.6자/초는 레퍼런스 영상 실측값(276자 / 32.1초). 문장별로는 7.2~10.3자/초로 흔들려서
// 이 값으로 자막을 배치하면 뒤로 갈수록 목소리와 어긋난다 — 그래서 추정은 최후의 수단이다.
const CHARS_PER_SECOND = 8.6
const MIN_LINE_SECONDS = 1.8
const MAX_LINE_SECONDS = 4.5
/** 아웃트로까지 합쳐 이 길이를 넘기면 문장을 덜어낸다 */
const MAX_TOTAL_SECONDS = 35
const OUTRO_SECONDS = 2

function secondsFor(text: string): number {
  const raw = text.length / CHARS_PER_SECOND
  return Math.round(Math.min(MAX_LINE_SECONDS, Math.max(MIN_LINE_SECONDS, raw)) * 10) / 10
}

// 대본을 못 만들었을 때 쓰는 기본값 — 렌더가 통째로 실패하는 것보단 낫다.
// 지어낸 사실이 없도록 전부 '항상 참'인 문장으로만 짠다.
function fallbackLines(cleaningType: string): ReelLine[] {
  return [
    { text: `${cleaningType}, 어디까지 해야 끝일까요?`, seconds: 0, emphasis: true },
    { text: '눈에 보이는 곳만 닦으면 금방 다시 티가 납니다.', seconds: 0, emphasis: false },
    { text: '손이 잘 안 닿는 구석부터 잡아야 오래갑니다.', seconds: 0, emphasis: false },
    { text: '오늘도 순서대로 하나씩 짚었습니다.', seconds: 0, emphasis: false },
    { text: '이렇게 해두면 다음 청소가 훨씬 쉬워집니다.', seconds: 0, emphasis: false },
    { text: '깨끗하게 오래 쓰고 싶다면 이 순서를 기억하세요.', seconds: 0, emphasis: true },
  ].map((l) => ({ ...l, seconds: secondsFor(l.text) }))
}

/**
 * 작업 보고서 → 릴스 나레이션 대본.
 *
 * 대본 골격은 조회수 잘 나오는 청소 릴스에서 그대로 가져왔다:
 * 증상 질문 → 원인 → 우리가 아는 이유 → 통념 깨기 → 해법 → 방법 → 차별점 → 마무리.
 * 업체 자랑을 넣지 않는 게 핵심이다 — 시청자가 따라 할 수 있는 정보라야 저장·공유가 된다.
 */
export async function generateReelScript(input: ReelScriptInput): Promise<ReelLine[]> {
  const material = [
    `서비스: ${input.cleaningType}`,
    input.beforeStatus && `작업 전 상태: ${input.beforeStatus}`,
    input.workDetails && `작업 내용: ${input.workDetails}`,
    input.afterResult && `작업 결과: ${input.afterResult}`,
    input.siteNote && `현장 하자·특이사항: ${input.siteNote}`,
    input.careAdvice && `앞으로 손봐야 할 것: ${input.careAdvice}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = getClaude('reel-script')

    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `너는 조회수 잘 나오는 한국 청소업체 릴스의 나레이션 대본을 쓴다.
아래는 오늘 실제로 다녀온 현장의 작업 보고서다. 이걸로 30초짜리 나레이션 대본을 써라.

## 오늘 현장 기록
${material}

## 대본 골격 (이 순서를 지켜라)
1. 시청자가 겪는 증상을 질문으로 — "~한다고요?" / "~해보셨나요?"
2. 그게 뭔지, 왜 생기는지
3. 우리가 그걸 아는 이유 (오늘 현장에서 본 것을 근거로)
4. 흔한 통념 깨기 — "이렇게 해도 안 됩니다"
5. 그래서 어떻게 해야 하는지
6. 구체적인 방법 한 가지
7. 그렇게 하면 뭐가 다른지
8. 명령형 마무리 — "~하세요"

## 절대 규칙
- **위 현장 기록에 없는 사실을 지어내지 마라.** 숫자·기간·성분·브랜드를 만들어내면 안 된다.
  재료가 부족하면 그 항목은 건너뛰고 문장 수를 줄여라.
- 업체 자랑·홍보 문구 금지. 시청자가 집에서 따라 할 수 있는 정보여야 한다.
- "저희가 잘합니다", "믿고 맡기세요" 같은 문장 금지
- 이모지·특수기호·괄호 금지. 소리 내어 읽을 문장이라 읽히지 않는 기호는 넣지 마라
- 각 문장은 한국어 15~28자. 한 문장에 정보 하나만
- 총 8~11문장
- 존댓말 구어체. 실제로 말하듯이. 빠르게 읽힐 문장이라 군더더기 없이 짧게

## 출력 형식 (JSON 배열만)
[
  { "text": "문장", "emphasis": true },
  ...
]
emphasis는 첫 문장과 마지막 문장만 true, 나머지는 false.
JSON 배열만 출력해라. 다른 텍스트는 절대 넣지 마라.`,
        },
      ],
    })

    // content[0]이 곧 답이라고 가정하면 안 된다 — 생각 블록이 먼저 오면 그 자리가 밀린다
    const text = textFrom(response)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return fallbackLines(input.cleaningType)

    const parsed = JSON.parse(jsonMatch[0]) as { text?: unknown; emphasis?: unknown }[]
    const lines = parsed
      .filter((l) => l && typeof l.text === 'string' && l.text.trim().length >= 4)
      .slice(0, 10)
      .map((l) => {
        // 소리로 읽히는 문장이라 읽히지 않는 기호는 미리 털어낸다
        const clean = (l.text as string)
          .replace(/[*_#`~•▶►◆■●]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40)
        return { text: clean, seconds: secondsFor(clean), emphasis: l.emphasis === true }
      })

    if (lines.length < 5) return fallbackLines(input.cleaningType)

    // 길면 뒤에서부터 덜어낸다. 마지막 문장(마무리 멘트)은 남기고 그 앞부터 뺀다 —
    // 숏폼은 35초를 넘기면 끝까지 안 보고, 마무리가 잘리면 영상이 끊긴 것처럼 보인다.
    const trimmed = [...lines]
    while (trimmed.length > 6 && scriptDuration(trimmed) + OUTRO_SECONDS > MAX_TOTAL_SECONDS) {
      trimmed.splice(trimmed.length - 2, 1)
    }

    // 강조는 처음과 끝 하나씩만 — 전부 노랑이면 강조가 아니다
    return trimmed.map((l, i) => ({ ...l, emphasis: i === 0 || i === trimmed.length - 1 }))
  } catch (err) {
    console.error('[ReelScript] 대본 생성 실패:', err)
    return fallbackLines(input.cleaningType)
  }
}

/** 대본 전체를 음성으로 읽을 때의 길이(초) */
export function scriptDuration(lines: ReelLine[]): number {
  return lines.reduce((sum, l) => sum + l.seconds, 0)
}


// ── 자막 쪼개기 ────────────────────────────────────────────
//
// 한 문장을 통째로 3초씩 띄우면 화면이 멈춘 것처럼 보인다.
// 요즘 숏폼 자막은 1~2초마다 다음 조각으로 넘어가면서 계속 움직인다.
// 그래서 '문장 = 음성 한 마디'는 그대로 두고, 화면에 뜨는 자막만 더 잘게 나눈다.
// 조각들의 시간 합이 그 문장의 음성 길이와 같으므로 목소리와 어긋나지 않는다.

/**
 * 자막 한 조각이 화면에 머무는 목표 시간(초).
 *
 * 짧을수록 화면이 계속 움직여 긴박해 보인다. 다만 0.6초 밑으로 내려가면 못 읽는다.
 */
const TARGET_CAPTION_SECONDS = 1.1
/** 이보다 짧게는 쪼개지 않는다 — 읽을 틈이 없다 */
const MIN_CAPTION_SECONDS = 0.65
/** 한 조각에 넣을 글자 수 상한 — 시간이 짧아도 글이 길면 한 줄에 안 들어간다 */
const MAX_CAPTION_CHARS = 11

export interface ReelCaption {
  text: string
  /** 영상 전체 기준 시작 시각(초) */
  start: number
  seconds: number
  emphasis: boolean
}

/**
 * 문장을 단어 경계에서 n조각으로 나눈다.
 * 글자 수가 고르게 되도록 담되 순서는 그대로 둔다.
 */
function splitWords(text: string, pieces: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (pieces <= 1 || words.length <= 1) return [text]

  const n = Math.min(pieces, words.length)
  const perPiece = text.length / n
  const out: string[] = []
  let current: string[] = []

  for (const word of words) {
    current.push(word)
    const remainingPieces = n - out.length - 1
    const remainingWords = words.length - (out.reduce((s, p) => s + p.split(' ').length, 0) + current.length)
    // 남은 조각마다 최소 한 단어는 남겨둬야 한다
    const mustClose = remainingWords <= remainingPieces
    if ((current.join(' ').length >= perPiece || mustClose) && out.length < n - 1) {
      out.push(current.join(' '))
      current = []
    }
  }
  if (current.length > 0) out.push(current.join(' '))
  return out
}

/**
 * 나레이션 문장들 → 화면에 뜨는 자막 조각들.
 *
 * 문장의 음성 길이를 조각들이 글자 수 비율로 나눠 갖는다.
 * 영상 클립 길이와는 아무 상관이 없다 — 영상은 뒤에 깔리는 배경일 뿐이다.
 */
export function toCaptions(lines: ReelLine[]): ReelCaption[] {
  const captions: ReelCaption[] = []
  let lineStart = 0

  for (const line of lines) {
    // 시간으로도 나누고 글자 수로도 나눠서, 둘 중 더 잘게 쪼개는 쪽을 따른다
    const byTime = Math.round(line.seconds / TARGET_CAPTION_SECONDS)
    const byLength = Math.ceil(line.text.length / MAX_CAPTION_CHARS)
    const wanted = Math.max(1, byTime, byLength)

    // ⚠️조각 수만 정하고 끝내면 안 된다. 조각마다 글자 수가 달라서 짧은 조각이
    //   0.2초처럼 못 읽을 만큼 스쳐 지나갈 수 있다. 실제로 나눠보고 가장 짧은 조각이
    //   최소 시간을 넘는, 그러면서 가장 잘게 쪼갠 경우를 고른다.
    let chunks: string[] = [line.text]
    for (let n = wanted; n >= 1; n--) {
      const candidate = splitWords(line.text, n)
      const total = candidate.reduce((sum, c) => sum + c.length, 0) || 1
      const shortest = Math.min(
        ...candidate.map((c) => (line.seconds * c.length) / total),
      )
      if (n === 1 || shortest >= MIN_CAPTION_SECONDS) {
        chunks = candidate
        break
      }
    }

    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1
    let offset = 0
    chunks.forEach((text, i) => {
      // 마지막 조각은 남은 시간을 전부 가져간다 — 반올림 오차가 쌓여 목소리와 어긋나지 않게
      const seconds =
        i === chunks.length - 1
          ? line.seconds - offset
          : Math.round(((line.seconds * text.length) / totalChars) * 100) / 100

      captions.push({
        text,
        start: Math.round((lineStart + offset) * 100) / 100,
        seconds: Math.round(seconds * 100) / 100,
        emphasis: line.emphasis,
      })
      offset += seconds
    })

    lineStart += line.seconds
  }

  return captions
}
