import 'server-only'
import type { GeoIdentity, GeoQuestionResult, GeoMeasureResult } from '@/lib/geo/measure'
import { mapWithConcurrency, GEO_CONCURRENCY } from '@/lib/geo/run-parallel'
import { extractBusinessNames } from '@/lib/geo/extract-names'

// Gemini(구글 검색 그라운딩)로 GEO 노출 측정 — 실제 웹을 검색해 답하므로 '현재 지역 업체 현실'을 반영.
// Perplexity는 검색결과를 보지만, Gemini는 "AI가 손님에게 실제로 하는 답변"에 우리가 나오는지(답변 레벨)를 본다.
// 판정 = 답변 텍스트 또는 인용 출처에 업체 식별 신호(needles)가 있으면 '노출'.

// 손님이 쓰는 제미나이에 가까운 모델로 잰다. 약한 모델로 재면 실제보다 낮게 나온다.
// 모델명이 바뀌거나 계정에서 못 쓰면 자동으로 아래 것으로 내려간다.
const PRIMARY_MODEL = process.env.GEMINI_GEO_MODEL || 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-2.0-flash'

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
  model = PRIMARY_MODEL,
): Promise<GeoMeasureResult> {
  let useModel = model
  try {
    await measureOne(apiKey, useModel, queries[0] ?? '테스트', [])
  } catch (e) {
    console.warn(`[GEO/Gemini] ${useModel} 사용 불가 → ${FALLBACK_MODEL}로 대체:`, e instanceof Error ? e.message : e)
    useModel = FALLBACK_MODEL
  }

  // 동시에 던진다 — 하나씩 물으면 질문을 늘릴수록 함수 제한시간에 걸린다.
  const results = await mapWithConcurrency(queries, GEO_CONCURRENCY, async (q) => {
    try {
      return await measureOne(apiKey, useModel, q, identity.needles)
    } catch (e) {
      console.error('[GEO/Gemini] 측정 실패:', q, e instanceof Error ? e.message : e)
      return { query: q, mentioned: false, matchedUrl: null, topDomains: [] } as GeoQuestionResult
    }
  })
  console.log(`[GEO/Gemini] 모델=${useModel} 질문=${queries.length} 잡힘=${results.filter((r) => r.mentioned).length}`)
  const cited = results.filter((r) => r.mentioned).length
  const total = results.length
  return { results, cited, total, sharePct: total ? Math.round((cited / total) * 100) : 0 }
}
