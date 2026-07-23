import 'server-only'
import type { GeoIdentity, GeoQuestionResult, GeoMeasureResult } from '@/lib/geo/measure'

// OpenAI(ChatGPT)로 GEO 노출 측정 — 웹 검색이 내장된 search 모델을 써서 '현재 웹'을 근거로 답하게 함.
// (일반 gpt 모델은 웹 검색을 안 해 최신 지역 업체를 반영 못 하므로 search 모델 필수)
// 판정 = 답변 텍스트 또는 인용(annotations)에 업체 식별 신호(needles)가 있으면 '노출'.

// 모델은 env로 교체 가능(모델명 변경 대비). 기본은 웹 검색 내장 mini 모델.
const DEFAULT_MODEL = process.env.OPENAI_GEO_MODEL || 'gpt-4o-mini-search-preview'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

interface UrlCitation { url?: string; title?: string }
interface Annotation { type?: string; url_citation?: UrlCitation }
interface OpenAIResponse {
  choices?: { message?: { content?: string; annotations?: Annotation[] } }[]
}

async function measureOne(apiKey: string, model: string, query: string, needles: string[]): Promise<GeoQuestionResult> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: query }],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)

  const data = (await res.json()) as OpenAIResponse
  const msg = data.choices?.[0]?.message
  const answer = msg?.content ?? ''
  const citations = (msg?.annotations ?? [])
    .map((a) => (a.url_citation?.url || a.url_citation?.title || '').trim())
    .filter(Boolean)

  const low = needles.map((n) => n.toLowerCase()).filter(Boolean)
  const hay = `${answer} ${citations.join(' ')}`.toLowerCase()
  const mentioned = low.some((n) => hay.includes(n))

  const topDomains = citations
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

// 여러 질문 측정 — 순차 + 지연. 개별 실패는 미노출로 처리(전체 중단 방지).
export async function measureGeoShareOfVoiceOpenAI(
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
      console.error('[GEO/OpenAI] 측정 실패:', q, e instanceof Error ? e.message : e)
      results.push({ query: q, mentioned: false, matchedUrl: null, topDomains: [] })
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  const cited = results.filter((r) => r.mentioned).length
  const total = results.length
  return { results, cited, total, sharePct: total ? Math.round((cited / total) * 100) : 0 }
}
