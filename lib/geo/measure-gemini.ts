import 'server-only'
import type { GeoIdentity, GeoQuestionResult, GeoMeasureResult } from '@/lib/geo/measure'
import { mapWithConcurrency, GEO_CONCURRENCY } from '@/lib/geo/run-parallel'
import { extractBusinessNames } from '@/lib/geo/extract-names'

// Gemini(구글 검색 그라운딩)로 GEO 노출 측정 — 실제 웹을 검색해 답하므로 '현재 지역 업체 현실'을 반영.
// Perplexity는 검색결과를 보지만, Gemini는 "AI가 손님에게 실제로 하는 답변"에 우리가 나오는지(답변 레벨)를 본다.
// 판정 = 답변 텍스트 또는 인용 출처에 업체 식별 신호(needles)가 있으면 '노출'.

// 쓸 모델은 계정에 실제로 있는 것 중에서 고른다.
//
// 예전엔 'gemini-2.0-flash'로 박아뒀는데 이 키로는 그 이름이 없어 호출마다 404가 났다.
// 그런데 실패를 '노출 안 됨'으로 처리해서, 화면에는 "Gemini 0/30"이 정상 측정한 것처럼
// 떴다. 몇 주 동안 제미나이는 한 번도 measure된 적이 없었다.
// 모델명을 코드에 박으면 같은 일이 또 난다 — 계정이 가진 목록을 물어보고 고른다.
const MODEL_PREFERENCE = ['2.5-flash', '2.5-pro', '2.0-flash', 'flash-latest', 'flash', 'pro']

// 목록 조회가 막혔을 때 직접 찔러볼 후보. 위에서부터 실제로 호출해 보고 되는 것을 쓴다.
const FALLBACK_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
]

// API 버전도 계정·모델에 따라 갈린다. 둘 다 시도한다.
const API_VERSIONS = ['v1beta', 'v1']

let cached: { model: string; version: string } | null = null

interface ModelListResponse {
  models?: { name?: string; supportedGenerationMethods?: string[] }[]
}

function urlFor(version: string, model: string, key: string) {
  return `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${key}`
}

/** 이 모델·버전 조합으로 실제 호출이 되는지 한 번 찔러본다(검색 도구까지 붙여서). */
async function probe(apiKey: string, version: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(urlFor(version, model, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: '안녕' }] }],
        tools: [{ google_search: {} }],
      }),
    })
    if (res.ok) return true
    console.warn(`[GEO/Gemini] 후보 실패 ${version}/${model} → ${res.status}`)
    return false
  } catch (e) {
    console.warn(`[GEO/Gemini] 후보 실패 ${version}/${model}:`, e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * 실제로 호출이 되는 모델·API 버전 조합을 찾는다.
 *
 * 모델명을 코드에 박아두면 안 된다 — 'gemini-2.0-flash'로 박아뒀다가 이 키에 그 이름이
 * 없어 호출마다 404가 났고, 그걸 '노출 안 됨'으로 기록해 몇 주 동안 "Gemini 0/30"이
 * 정상 측정처럼 화면에 떴다.
 *
 * 순서: ① 계정이 가진 목록을 물어보고 고른다 → ② 목록이 막히면 후보를 직접 찔러본다.
 * 어느 쪽이든 마지막엔 '실제로 호출되는 것'만 통과시킨다.
 */
async function resolveModel(apiKey: string): Promise<{ model: string; version: string }> {
  if (cached) return cached

  const forced = process.env.GEMINI_GEO_MODEL
  if (forced) {
    for (const version of API_VERSIONS) {
      if (await probe(apiKey, version, forced)) {
        cached = { model: forced, version }
        console.log(`[GEO/Gemini] 지정 모델 사용: ${version}/${forced}`)
        return cached
      }
    }
    console.warn(`[GEO/Gemini] 지정 모델 ${forced}이 안 돼 자동 선택으로 넘어감`)
  }

  // ① 계정이 가진 목록에서 고르기
  for (const version of API_VERSIONS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`)
      if (!res.ok) {
        console.warn(`[GEO/Gemini] 모델 목록 조회 실패 ${version} → ${res.status}`)
        continue
      }
      const data = (await res.json()) as ModelListResponse
      const usable = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => (m.name ?? '').replace(/^models\//, ''))
        .filter(Boolean)
        // 실험·프리뷰 딱지가 붙은 건 뒤로 미룬다(자주 사라진다)
        .sort((a, b) => Number(/exp|preview/.test(a)) - Number(/exp|preview/.test(b)))

      for (const want of MODEL_PREFERENCE) {
        const hit = usable.find((m) => m.includes(want))
        if (hit && (await probe(apiKey, version, hit))) {
          cached = { model: hit, version }
          console.log(`[GEO/Gemini] 사용할 모델: ${version}/${hit} (쓸 수 있는 ${usable.length}개 중 선택)`)
          return cached
        }
      }
      console.warn(`[GEO/Gemini] ${version} 목록 ${usable.length}개 중 쓸 만한 게 없음: ${usable.slice(0, 8).join(', ')}`)
    } catch (e) {
      console.warn(`[GEO/Gemini] 모델 목록 조회 오류 ${version}:`, e instanceof Error ? e.message : e)
    }
  }

  // ② 목록이 막혔으면 후보를 직접 찔러본다
  for (const version of API_VERSIONS) {
    for (const model of FALLBACK_CANDIDATES) {
      if (await probe(apiKey, version, model)) {
        cached = { model, version }
        console.log(`[GEO/Gemini] 후보에서 찾음: ${version}/${model}`)
        return cached
      }
    }
  }

  throw new Error('Gemini 호출 가능한 모델을 찾지 못했습니다 (키·권한 확인 필요)')
}

function geminiUrl(model: string, key: string, version = 'v1beta') {
  return urlFor(version, model, key)
}

interface GeminiPart { text?: string }
interface GroundingChunk { web?: { uri?: string; title?: string } }
interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] }
    groundingMetadata?: { groundingChunks?: GroundingChunk[] }
  }[]
}

async function measureOne(apiKey: string, model: string, query: string, needles: string[], version = 'v1beta'): Promise<GeoQuestionResult> {
  const res = await fetch(geminiUrl(model, apiKey, version), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: query }] }],
      tools: [{ google_search: {} }], // 구글 검색 그라운딩 — 최신 웹 근거로 답하게 함
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}`)

  const data = (await res.json()) as GeminiResponse
  const cand = data.candidates?.[0]
  const answer = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join(' ')
  const chunks = cand?.groundingMetadata?.groundingChunks ?? []
  const sources = chunks.map((c) => (c.web?.title || c.web?.uri || '').trim()).filter(Boolean)

  const low = needles.map((n) => n.toLowerCase()).filter(Boolean)
  const hay = `${answer} ${sources.join(' ')}`.toLowerCase()
  const mentioned = low.some((n) => hay.includes(n))

  // 인용 출처(경쟁 채널) — 도메인 추출 실패 시 사이트명 그대로 사용
  const topDomains = sources
    .slice(0, 3)
    .map((s) => {
      try {
        return new URL(s).hostname.replace(/^www\./, '')
      } catch {
        return s
      }
    })
    .filter(Boolean)

  return { query, mentioned, matchedUrl: null, topDomains, names: extractBusinessNames(answer) }
}

// 여러 질문 측정 — 동시 실행(레이트리밋 보호용 상한 있음). 개별 실패는 미노출로 처리(전체 중단 방지).
export async function measureGeoShareOfVoiceGemini(
  apiKey: string,
  queries: string[],
  identity: GeoIdentity,
  model?: string,
): Promise<GeoMeasureResult> {
  const picked = model ? { model, version: 'v1beta' } : await resolveModel(apiKey)
  const useModel = picked.model
  let failed = 0

  // 동시에 던진다 — 하나씩 물으면 질문을 늘릴수록 함수 제한시간에 걸린다.
  const results = await mapWithConcurrency(queries, GEO_CONCURRENCY, async (q) => {
    try {
      return await measureOne(apiKey, useModel, q, identity.needles, picked.version)
    } catch (e) {
      failed++
      console.error('[GEO/Gemini] 측정 실패:', q, e instanceof Error ? e.message : e)
      return { query: q, mentioned: false, matchedUrl: null, topDomains: [] } as GeoQuestionResult
    }
  })
  console.log(`[GEO/Gemini] 모델=${picked.version}/${useModel} 질문=${queries.length} 실패=${failed} 잡힘=${results.filter((r) => r.mentioned).length}`)
  const cited = results.filter((r) => r.mentioned).length
  const total = results.length
  return { results, cited, total, failed, sharePct: total ? Math.round((cited / total) * 100) : 0 }
}
