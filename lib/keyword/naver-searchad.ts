import crypto from 'node:crypto'

// 네이버 검색광고 '키워드도구' API — 실제 월간 검색량·경쟁도 조회
// 퀄리오 본사 계정 1개로 전 고객사 대행(알림톡과 동일 구조). 사장님은 가입 불필요.
// 인증 정보(env)가 없거나 호출이 실패하면 빈 결과를 돌려주고, 호출부는 기존 방식(AI 추측)으로 폴백한다.

const BASE_URL = 'https://api.searchad.naver.com'
const KEYWORD_PATH = '/keywordstool'

export interface KeywordStat {
  keyword: string
  monthlySearches: number // PC + 모바일 월 검색량 합
  competition: '낮음' | '중간' | '높음'
}

// 검색량이 '< 10' 같은 문자열로 오는 경우를 숫자로 보정
function parseVolume(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    if (v.includes('<')) return 9 // '< 10' = 10 미만
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

// 네이버는 응답 키워드에서 공백을 제거하고 대문자로 반환하므로 매칭 시 정규화
function normalize(k: string): string {
  return k.replace(/\s+/g, '').toUpperCase()
}

// HMAC-SHA256 서명 (검색광고 API 인증 규격: `${timestamp}.${method}.${path}`)
function sign(timestamp: string, method: string, path: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${method}.${path}`).digest('base64')
}

interface KeywordRow {
  relKeyword: string
  monthlyPcQcCnt: unknown
  monthlyMobileQcCnt: unknown
  compIdx?: string
}

// 씨드 키워드들의 실제 검색량·경쟁도를 조회해 Map으로 반환 (키 = 넘긴 씨드 문자열).
// 인증 정보가 없으면 즉시 빈 Map — 네트워크 호출조차 하지 않음.
export async function getKeywordStats(seeds: string[]): Promise<Map<string, KeywordStat>> {
  const apiKey = process.env.NAVER_SEARCHAD_API_KEY
  const secret = process.env.NAVER_SEARCHAD_SECRET_KEY
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID

  const result = new Map<string, KeywordStat>()
  if (!apiKey || !secret || !customerId) return result // 키 미설정 시 조용히 폴백

  const unique = Array.from(new Set(seeds.map((s) => s.trim()).filter(Boolean)))

  // 키워드도구는 hintKeywords 최대 5개/호출 → 5개씩 배치로 순차 조회
  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5)
    try {
      const timestamp = Date.now().toString()
      const signature = sign(timestamp, 'GET', KEYWORD_PATH, secret)
      // 네이버 키워드도구는 hintKeywords에 공백이 있으면 400을 반환하므로 공백 제거해 전송
      // (응답 relKeyword도 공백이 제거돼 오므로 normalize 매칭엔 영향 없음)
      const hints = batch.map((s) => s.replace(/\s+/g, ''))
      const query = new URLSearchParams({ hintKeywords: hints.join(','), showDetail: '1' })

      const res = await fetch(`${BASE_URL}${KEYWORD_PATH}?${query.toString()}`, {
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': apiKey,
          'X-Customer': customerId,
          'X-Signature': signature,
        },
      })

      if (!res.ok) {
        console.error('[Keyword] 검색광고 API 응답 오류:', res.status)
        continue
      }

      const data = (await res.json()) as { keywordList?: KeywordRow[] }
      const list = data.keywordList ?? []

      // 배치의 각 씨드에 대해 응답에서 같은 키워드(공백 제거) 행을 찾아 매칭
      for (const seed of batch) {
        const row = list.find((r) => normalize(r.relKeyword) === normalize(seed))
        if (!row) continue
        const monthlySearches = parseVolume(row.monthlyPcQcCnt) + parseVolume(row.monthlyMobileQcCnt)
        const competition =
          row.compIdx === '낮음' || row.compIdx === '중간' || row.compIdx === '높음' ? row.compIdx : '중간'
        result.set(seed, { keyword: seed, monthlySearches, competition })
      }
    } catch (err) {
      console.error('[Keyword] 검색광고 조회 실패:', err instanceof Error ? err.message : err)
    }
  }

  return result
}

// 씨드 키워드의 '연관 검색어'를 실검색량 순으로 반환 (본문·태그에 실제 검색어 주입용).
// 키워드도구 응답의 keywordList 전체(연관어 포함)에서 씨드 자신을 빼고 검색량 상위 N개를 고른다.
export async function getRelatedKeywords(seed: string, limit = 8): Promise<KeywordStat[]> {
  const apiKey = process.env.NAVER_SEARCHAD_API_KEY
  const secret = process.env.NAVER_SEARCHAD_SECRET_KEY
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID
  if (!apiKey || !secret || !customerId) return []

  try {
    const timestamp = Date.now().toString()
    const signature = sign(timestamp, 'GET', KEYWORD_PATH, secret)
    const query = new URLSearchParams({ hintKeywords: seed.replace(/\s+/g, ''), showDetail: '1' })
    const res = await fetch(`${BASE_URL}${KEYWORD_PATH}?${query.toString()}`, {
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': apiKey,
        'X-Customer': customerId,
        'X-Signature': signature,
      },
    })
    if (!res.ok) {
      console.error('[Keyword] 연관 검색어 API 응답 오류:', res.status)
      return []
    }
    const data = (await res.json()) as { keywordList?: KeywordRow[] }
    const seedNorm = normalize(seed)
    // 씨드에서 2글자 조각(bi-gram)들을 뽑아, 이 조각 중 하나라도 포함하는 연관어만 남긴다.
    // (네이버는 검색량 큰 무관 단어도 연관어로 주므로 — 미세먼지·분리수거 등 오프토픽 태그 방지)
    const grams: string[] = []
    for (let i = 0; i < seedNorm.length - 1; i++) grams.push(seedNorm.slice(i, i + 2))
    const isRelevant = (relNorm: string) => grams.some((g) => relNorm.includes(g))

    return (data.keywordList ?? [])
      .filter((r) => normalize(r.relKeyword) !== seedNorm && isRelevant(normalize(r.relKeyword)))
      .map((r) => ({
        keyword: r.relKeyword,
        monthlySearches: parseVolume(r.monthlyPcQcCnt) + parseVolume(r.monthlyMobileQcCnt),
        competition:
          r.compIdx === '낮음' || r.compIdx === '중간' || r.compIdx === '높음'
            ? (r.compIdx as KeywordStat['competition'])
            : '중간',
      }))
      .filter((k) => k.monthlySearches > 0)
      .sort((a, b) => b.monthlySearches - a.monthlySearches)
      .slice(0, limit)
  } catch (err) {
    console.error('[Keyword] 연관 검색어 조회 실패:', err instanceof Error ? err.message : err)
    return []
  }
}

// 기회 점수 — 검색량이 많을수록↑, 경쟁이 셀수록↓. '검색 많고 경쟁 적은' 키워드를 상위로.
export function opportunityScore(stat: KeywordStat): number {
  const weight = stat.competition === '낮음' ? 1 : stat.competition === '중간' ? 1.6 : 2.5
  return stat.monthlySearches / weight
}
