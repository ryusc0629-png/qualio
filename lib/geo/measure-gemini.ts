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
const MODEL_PREFERENCE = ['2.5-flash', '2.5-pro', '2.0-flash', 'flash', 'pro']

let cachedModel: string | null = null

interface ModelListResponse {
  models?: { name?: string; supportedGenerationMethods?: string[] }[]
}

/** 계정에서 쓸 수 있는 모델 중 검색 그라운딩에 적합한 것을 고른다(한 번만 조회하고 재사용). */
async function resolveModel(apiKey: string): Promise<string> {
  if (cachedModel) return cachedModel
  const forced = process.env.GEMINI_GEO_MODEL
  if (forced) {
    cachedModel = forced
    return forced
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
  if (!res.ok) throw new Error(`Gemini 모델 목록 조회 실패 ${res.status}`)
  const data = (await res.json()) as ModelListResponse

  const usable = (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter(Boolean)
    // 실험·프리뷰 딱지가 붙은 건 뒤로 미룬다(자주 사라진다)
    .sort((a, b) => Number(/exp|preview/.test(a)) - Number(/exp|preview/.test(b)))

  for (const want of MODEL_PREFERENCE) {
    const hit = usable.find((m) => m.includes(want))
    if (hit) {
      cachedModel = hit
      console.log(`[GEO/Gemini] 사용할 모델: ${hit} (계정에서 쓸 수 있는 ${usable.length}개 중 선택)`)
      return hit
    }
  }
  throw new Error(`Gemini 쓸 수 있는 모델이 없음 (조회된 ${usable.length}개)`)
}

function geminiUrl(model: string, key: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
}

interface GeminiPart { text?: string }
interface GroundingChunk { web?: { uri?: string; title?: string } }
interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] }
    groundingMetadata?: { groundingChunks?: GroundingChunk[] }
  }[]
}

async function measureOne(apiKey: string, model: string, query: string, needles: string[]): Promise<GeoQuestionResult> {
  const res = await fetch(geminiUrl(model, apiKey), {
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
  const useModel = model ?? (await resolveModel(apiKey))
  let failed = 0

  // 동시에 던진다 — 하나씩 물으면 질문을 늘릴수록 함수 제한시간에 걸린다.
  const results = await mapWithConcurrency(queries, GEO_CONCURRENCY, async (q) => {
    try {
      return await measureOne(apiKey, useModel, q, identity.needles)
    } catch (e) {
      failed++
      console.error('[GEO/Gemini] 측정 실패:', q, e instanceof Error ? e.message : e)
      return { query: q, mentioned: false, matchedUrl: null, topDomains: [] } as GeoQuestionResult
    }
  })
  console.log(`[GEO/Gemini] 모델=${useModel} 질문=${queries.length} 실패=${failed} 잡힘=${results.filter((r) => r.mentioned).length}`)
  const cited = results.filter((r) => r.mentioned).length
  const total = results.length
  return { results, cited, total, failed, sharePct: total ? Math.round((cited / total) * 100) : 0 }
}
