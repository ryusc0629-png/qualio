import 'server-only'
import type { GeoIdentity, GeoQuestionResult, GeoMeasureResult } from '@/lib/geo/measure'

// Gemini(구글 검색 그라운딩)로 GEO 노출 측정 — 실제 웹을 검색해 답하므로 '현재 지역 업체 현실'을 반영.
// Perplexity는 검색결과를 보지만, Gemini는 "AI가 손님에게 실제로 하는 답변"에 우리가 나오는지(답변 레벨)를 본다.
// 판정 = 답변 텍스트 또는 인용 출처에 업체 식별 신호(needles)가 있으면 '노출'.

const DEFAULT_MODEL = 'gemini-2.0-flash' // google_search 그라운딩 지원 + 저비용

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

  return { query, mentioned, matchedUrl: null, topDomains }
}

// 여러 질문 측정 — 레이트리밋 보호 위해 순차 + 지연. 개별 실패는 미노출로 처리(전체 중단 방지).
export async function measureGeoShareOfVoiceGemini(
  apiKey: string,
  queries: string[],
  identity: GeoIdentity,
  model = DEFAULT_MODEL,
): Promise<GeoMeasureResult> {
  const results: GeoQuestionResult[] = []
  for (const q of queries) {
    try {
      results.push(await measureOne(apiKey, model, q, identity.needles))
    } catch (e) {
      console.error('[GEO/Gemini] 측정 실패:', q, e instanceof Error ? e.message : e)
      results.push({ query: q, mentioned: false, matchedUrl: null, topDomains: [] })
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  const cited = results.filter((r) => r.mentioned).length
  const total = results.length
  return { results, cited, total, sharePct: total ? Math.round((cited / total) * 100) : 0 }
}
