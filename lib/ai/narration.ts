// 릴스 나레이션 음성 합성(TTS) — 대본 텍스트를 mp3로 만든다.
//
// 왜 필요한가: 소리 없는 릴스는 10초짜리 클립 구간에서 시청자가 그냥 나간다.
// 화면이 멈춰 있어도 목소리가 계속 정보를 밀어주면 끝까지 본다 —
// 레퍼런스 영상이 32초에 컷 5개뿐인데도 버티는 이유가 이것이다.
//
// 실패해도 릴스 자체는 만들어야 한다(자막은 남는다). 그래서 던지지 않고 null을 돌려준다.

import { mp3DurationSeconds } from '@/lib/ai/mp3-duration'

/** 여성 차분한 톤 — 청소·생활정보 릴스에서 가장 무난하다 */
const VOICE = 'nova'
const MODEL = 'gpt-4o-mini-tts'

/** 합성이 오래 걸리면 포기하고 무음으로 간다 (릴스는 부가 기능) */
const TTS_TIMEOUT_MS = 60_000

/** 한 문장의 음성과 그 실제 길이 */
export interface NarrationClip {
  mp3: Buffer
  seconds: number
}

/**
 * 문장을 하나씩 따로 합성한다.
 *
 * 왜 통으로 안 만드나: 자막과 화면 길이를 목소리에 맞추려면 문장마다 정확한 길이가 필요하다.
 * 글자 수로 추정하면(레퍼런스 실측 7.2~10.3자/초) 뒤로 갈수록 자막이 목소리보다 밀린다.
 * 문장별로 만들면 각 mp3 길이가 곧 그 자막의 길이라 어긋날 수가 없다.
 *
 * 한 문장이라도 실패하면 전체를 무음으로 돌린다 — 중간에 목소리가 끊기는 영상보다 낫다.
 */
export async function synthesizeLines(texts: string[]): Promise<NarrationClip[] | null> {
  if (texts.length === 0) return null

  // 한 줄씩 순서대로 부르면 문장 수만큼 시간이 쌓인다(10문장이면 40초 가까이).
  // 현장 직원이 버튼을 누르고 그만큼 기다리게 되므로 몇 개씩 동시에 부른다.
  // 결과는 원래 순서 자리에 그대로 채워 넣어 말 순서가 섞이지 않게 한다.
  const CONCURRENCY = 4
  const clips = new Array<NarrationClip | null>(texts.length).fill(null)
  let cursor = 0

  async function worker() {
    for (;;) {
      const i = cursor++
      if (i >= texts.length) return

      const mp3 = await synthesizeNarration(texts[i])
      if (!mp3) return

      const seconds = mp3DurationSeconds(mp3)
      if (seconds === null || seconds <= 0) {
        console.error('[Narration] 합성된 음성 길이를 못 읽었어요:', texts[i].slice(0, 20))
        return
      }
      clips[i] = { mp3, seconds }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, texts.length) }, worker))

  // 한 문장이라도 비면 무음으로 간다 — 중간에 목소리가 끊기는 영상보다 낫다
  if (clips.some((c) => c === null)) {
    console.error('[Narration] 일부 문장을 합성하지 못해 무음으로 진행합니다')
    return null
  }

  return clips as NarrationClip[]
}

export async function synthesizeNarration(text: string): Promise<Buffer | null> {
  // 키에 줄바꿈·공백이 섞이면 Authorization 헤더 생성에서 TypeError가 난다 (transcribe.ts와 같은 이유)
  const apiKey = process.env.OPENAI_API_KEY?.replace(/\s/g, '')
  if (!apiKey) {
    console.error('[Narration] OPENAI_API_KEY가 없어 음성 없이 진행합니다')
    return null
  }

  const speech = text.trim()
  if (!speech) return null

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        input: speech,
        response_format: 'mp3',
        // 광고 성우 톤이면 광고로 읽혀 넘긴다. 아는 사람이 알려주는 말투가 끝까지 보게 만든다.
        instructions:
          '한국어로 또박또박 읽어주세요. 광고를 읽는 성우 톤이 아니라, ' +
          '현장을 아는 사람이 옆에서 알려주듯 차분하고 친근하게. ' +
          '문장 사이는 살짝 쉬고, 속도는 조금 빠르게.',
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    })

    if (!res.ok) {
      // 응답 본문에 진짜 원인이 들어 있다 — 상태 코드만 찍으면 나중에 원인을 못 찾는다
      const errText = await res.text().catch(() => '')
      console.error('[Narration] OpenAI TTS 오류:', res.status, errText.slice(0, 500))
      return null
    }

    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    console.error('[Narration] 음성 합성 실패:', err)
    return null
  }
}
