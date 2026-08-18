import 'server-only'
import type { GeoIdentity, GeoQuestionResult, GeoMeasureResult } from '@/lib/geo/measure'
import { mapWithConcurrency, GEO_CONCURRENCY } from '@/lib/geo/run-parallel'
import { extractBusinessNames } from '@/lib/geo/extract-names'

// OpenAI(ChatGPT)로 GEO 노출 측정 — 웹 검색이 내장된 search 모델을 써서 '현재 웹'을 근거로 답하게 함.
// (일반 gpt 모델은 웹 검색을 안 해 최신 지역 업체를 반영 못 하므로 search 모델 필수)
// 판정 = 답변 텍스트 또는 인용(annotations)에 업체 식별 신호(needles)가 있으면 '노출'.

// 손님이 실제로 쓰는 것과 최대한 가까운 모델로 잰다.
//
// 예전엔 mini를 썼는데, 웹 챗지피티에서는 다트클린이 추천 목록에 뜨는데 우리 측정만
// 계속 0~1이었다. 손님이 쓰는 것보다 약한 모델로 재고 있었던 것이다.
// 모델명이 바뀌거나 계정에서 못 쓰면 자동으로 아래 것으로 내려간다(측정이 멈추지 않게).
// 후보를 위에서부터 실제로 찔러보고 되는 것을 쓴다.
// 모델명을 하나만 박아두면, 그 이름이 사라졌을 때 호출이 전부 실패하는데도
// 화면에는 '0점'으로 떠서 몇 주씩 모르고 지나간다(제미나이에서 실제로 겪었다).
const MODEL_CANDIDATES = [
  process.env.OPENAI_GEO_MODEL,
  'gpt-4o-search-preview',
  'gpt-4o-mini-search-preview',
].filter((m): m is string => !!m)

let cachedModel: string | null = null

/** 이 모델로 실제 호출이 되는지 한 번 찔러본다 */
async function probe(apiKey: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: '안녕' }] }),
    })
    if (res.ok) return true
    console.warn(`[GEO/OpenAI] 후보 실패 ${model} → ${res.status}`)
    return false
  } catch (e) {
    console.warn(`[GEO/OpenAI] 후보 실패 ${model}:`, e instanceof Error ? e.message : e)
    return false
  }
}

async function resolveModel(apiKey: string): Promise<string> {
  if (cachedModel) return cachedModel
  for (const m of MODEL_CANDIDATES) {
    if (await probe(apiKey, m)) {
      cachedModel = m
      console.log(`[GEO/OpenAI] 사용할 모델: ${m}`)
      return m
    }
  }
  throw new Error('OpenAI 호출 가능한 검색 모델을 찾지 못했습니다 (키·권한 확인 필요)')
}
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

interface UrlCitation { url?: string; title?: string }
interface Annotation { type?: string; url_citation?: UrlCitation }
interface OpenAIResponse {
  choices?: { message?: { content?: string; annotations?: Annotation[] } }[]
}

async function measureOne(
  apiKey: string,
  model: string,
  query: string,
  needles: string[],
  location?: GeoIdentity['location'],
): Promise<GeoQuestionResult> {
  // 위치를 함께 넘긴다 — 지역 업체를 찾는 질문은 위치 신호가 있어야 웹과 비슷하게 답한다
  const webSearchOptions = location?.region
    ? {
        user_location: {
          type: 'approximate',
          approximate: {
            country: 'KR',
            region: location.region,
            ...(location.city ? { city: location.city } : {}),
          },
        },
      }
    : undefined

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: query }],
      ...(webSearchOptions ? { web_search_options: webSearchOptions } : {}),
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

  return { query, mentioned, matchedUrl: null, topDomains, names: extractBusinessNames(answer) }
}

// 여러 질문 측정 — 동시 실행(레이트리밋 보호용 상한 있음). 개별 실패는 미노출로 처리(전체 중단 방지).
export async function measureGeoShareOfVoiceOpenAI(
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
      return await measureOne(apiKey, useModel, q, identity.needles, identity.location)
    } catch (e) {
      failed++
      console.error('[GEO/OpenAI] 측정 실패:', q, e instanceof Error ? e.message : e)
      return { query: q, mentioned: false, matchedUrl: null, topDomains: [] } as GeoQuestionResult
    }
  })
  console.log(`[GEO/OpenAI] 모델=${useModel} 질문=${queries.length} 잡힘=${results.filter((r) => r.mentioned).length}`)
  const cited = results.filter((r) => r.mentioned).length
  const total = results.length
  return { results, cited, total, failed, sharePct: total ? Math.round((cited / total) * 100) : 0 }
}
