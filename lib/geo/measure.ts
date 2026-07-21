import 'server-only'

// GEO 노출 측정 — 소비자 질문을 Perplexity 검색에 던져 우리 업체가 결과에 노출되는지 판정.
// 검색 API(/search)는 저렴·결정적이라 다수 업체×질문을 주기적으로 돌리기에 적합(답변 API보다 비용↓).
// "AI 답변에 인용되려면 먼저 검색 결과에 잡혀야 한다" — 노출률은 GEO의 선행 지표.

const PPLX_SEARCH_URL = 'https://api.perplexity.ai/search'

export interface GeoIdentity {
  // 업체 식별 신호(소문자 부분일치) — 업체명·slug·도메인 등. 하나라도 결과에 있으면 '노출'로 판정
  needles: string[]
}

export interface GeoQuestionResult {
  query: string
  mentioned: boolean
  matchedUrl: string | null
  topDomains: string[] // 그 질문 상위 3개 경쟁 도메인
}

export interface GeoMeasureResult {
  results: GeoQuestionResult[]
  cited: number
  total: number
  sharePct: number
}

interface PplxSearchItem { title?: string; url?: string; snippet?: string }

// 한 질문 측정 — 검색결과에 업체 식별 신호가 있으면 노출로 판정
async function measureOne(apiKey: string, query: string, needles: string[]): Promise<GeoQuestionResult> {
  const res = await fetch(PPLX_SEARCH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_results: 8, max_tokens_per_page: 128 }),
  })
  if (!res.ok) throw new Error(`Perplexity ${res.status}`)
  const data = (await res.json()) as { results?: PplxSearchItem[] }
  const results = data.results ?? []
  const low = needles.map((n) => n.toLowerCase()).filter(Boolean)
  const isHit = (s?: string) => {
    const t = (s ?? '').toLowerCase()
    return low.some((n) => t.includes(n))
  }
  let matchedUrl: string | null = null
  for (const r of results) {
    if (isHit(r.url) || isHit(r.title) || isHit(r.snippet)) {
      matchedUrl = r.url ?? ''
      break
    }
  }
  const topDomains = results
    .slice(0, 3)
    .map((r) => {
      try {
        return new URL(r.url ?? '').hostname.replace(/^www\./, '')
      } catch {
        return ''
      }
    })
    .filter(Boolean)
  return { query, mentioned: matchedUrl !== null, matchedUrl, topDomains }
}

// 여러 질문 측정 — 레이트리밋 보호 위해 순차 실행 + 소폭 지연. 개별 실패는 미노출로 처리(전체 중단 방지).
export async function measureGeoShareOfVoice(
  apiKey: string,
  queries: string[],
  identity: GeoIdentity,
): Promise<GeoMeasureResult> {
  const results: GeoQuestionResult[] = []
  for (const q of queries) {
    try {
      results.push(await measureOne(apiKey, q, identity.needles))
    } catch (e) {
      console.error('[GEO] 측정 실패:', q, e instanceof Error ? e.message : e)
      results.push({ query: q, mentioned: false, matchedUrl: null, topDomains: [] })
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  const cited = results.filter((r) => r.mentioned).length
  const total = results.length
  return { results, cited, total, sharePct: total ? Math.round((cited / total) * 100) : 0 }
}
