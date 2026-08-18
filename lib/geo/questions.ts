import { parseKoreanRegion } from '@/lib/address/parse-region'

// GEO 측정용 "소비자 질문 세트" 생성 — 지역×서비스×구매의도를 결정적으로 조합한다.
//
// AI를 쓰지 않는 이유: 측정 질문은 매번 같아야 추세 비교가 유효하고, 업체마다 매달
// AI를 돌리면 비용·지연·변동성이 생긴다. 소비자가 실제로 던지는 문형은 템플릿으로
// 충분히 잡히므로 결정적 규칙이 더 안정적이다.
//
// ─────────────────────────────────────────────────────────────────────
// [2026-08-18 개편 — 왜 바꿨나]
//
// 이전 규칙은 광역시("울산") × "추천/잘하는 곳"만 물었다. 그 결과 12번 측정 내내
// 노출률 0%였고, 상위 인용 도메인은 매번 숨고·미소·비교 블로그였다.
//
// 이유는 검색 실력이 아니라 질문의 구조다. "추천해줘"를 받은 AI는 답을 목록으로
// 내야 하므로 여러 업체가 실린 페이지(플랫폼·비교글)를 인용한다. 단일 업체 홈페이지는
// '추천 근거'로 쓰이기 어렵다. 게다가 광역 단위는 전국구 플랫폼의 전장이라
// 동네 업체가 글을 100편 써도 뚫리지 않는다.
//
// 그래서 '이길 수 있는 판'으로 질문을 옮긴다.
//   1) 지역을 시군구로 좁힌다 — 업체들이 출장 지역에 이미 시군구를 넣어 두었는데
//      예전 코드가 shortMetro()로 "울산 남구" → "울산"으로 뭉개 버리고 있었다.
//   2) "추천"(목록형 출처가 이김) 대신 "업체·비용"(구체적으로 답하는 단일 페이지가 이김)을 늘린다.
//   3) 실제로 일한 지역을 우선한다 — 시공 사례라는 근거가 있는 지역이라야 인용될 이유가 생긴다.
//   4) 브랜드 질문 1개를 넣는다 — "손님이 우리 이름을 듣고 AI에 물었을 때 제대로 나오는가"는
//      그 자체로 유효한 엔티티 지표다(의외로 안 잡히는 업체가 많다). 승률을 부풀리지 않도록 1개만 둔다.
//   5) 광역 질문 1개는 남긴다 — 못 이기는 판이지만 벤치마크로 추세를 본다.
// ─────────────────────────────────────────────────────────────────────

// 질문 상한 — 검색 API 호출 비용을 업체당 예측 가능하게 묶는다(질문 수 × 엔진 수만큼 호출).
const MAX_QUESTIONS = 12
// 조합에 쓸 상위 서비스 개수 — 너무 많으면 질문이 희석돼 핵심 서비스 신호가 약해진다.
const MAX_SERVICES = 3
// 메인 지역 외 추가로 공략할 시군구 최대 개수.
const MAX_EXTRA_AREAS = 3

/** 질문의 성격 — 카드에서 묶어 보여주고, 승패를 해석할 때 쓴다. */
export type GeoQuestionKind = 'brand' | 'price' | 'local' | 'broad'

// 지역 문자열에서 광역 단위명만 남긴다. "울산광역시"→"울산", "경기도"→"경기"
function shortMetro(raw: string | null | undefined): string {
  const first = (raw ?? '').trim().split(/\s+/)[0] ?? ''
  return first.replace(/(특별자치도|특별자치시|특별시|광역시|자치도|도|시)$/, '') || first
}

// 서비스명을 소비자 검색어 형태로 정리 — 괄호·단위·가격 수식을 떼고 핵심 명사만 남김.
// 예: "입주청소 (평당)" → "입주청소", "에어컨 청소(벽걸이)" → "에어컨 청소"
function normalizeService(name: string): string {
  return name
    .replace(/\(.*$/, '')
    .replace(/\d[\d,]*\s*원.*$/, '')
    .replace(/[/·].*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// 주소·지역 문자열 → "광역 시군구" 형태의 검색용 지역명.
// 예: "울산광역시 울주군 삼남읍 …" → "울산 울주군", "울산 남구" → "울산 남구"
export function toSearchArea(raw: string | null | undefined): string | null {
  const parts = parseKoreanRegion(raw)
  const metro = parts.sido ? shortMetro(parts.sido) : null
  const local = parts.gu ?? parts.gun ?? parts.si ?? null
  if (metro && local) return `${metro} ${local}`
  if (metro) return metro
  // 파서가 못 읽는 짧은 형태("울산 남구")는 앞 두 토큰만 살려 그대로 쓴다
  const tokens = (raw ?? '').normalize('NFC').trim().split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) return `${shortMetro(tokens[0])} ${tokens[1]}`
  if (tokens.length === 1) return shortMetro(tokens[0])
  return null
}

export interface GeoQuestionInput {
  /** 업체명 — 브랜드 질문 1개에 쓴다 */
  businessName?: string | null
  /** 사업장 주소 — 메인 지역(시군구) 판정 */
  address?: string | null
  /** 출장 지역 목록("울산 남구" 형태) */
  serviceAreas?: string[] | null
  /** 활성 서비스명 */
  serviceNames: string[]
  /**
   * 실제로 예약·작업이 있었던 지역("울산 남구" 형태, 많은 순).
   * 시공 사례라는 근거가 있는 지역이라 가장 먼저 공략한다.
   */
  activeAreas?: string[] | null
}

/**
 * 질문 문자열의 성격을 되돌려 준다.
 * 질문은 DB에 문자열로만 저장하므로, 종류는 저장하지 않고 여기서 결정적으로 다시 판정한다.
 */
export function classifyGeoQuestion(question: string, businessName?: string | null): GeoQuestionKind {
  const name = (businessName ?? '').trim()
  if (name.length >= 2 && question.includes(name)) return 'brand'
  if (/(비용|가격|얼마|평당)/.test(question)) return 'price'
  // 지역 토큰이 2개(광역+시군구)면 로컬, 광역 하나뿐이면 broad
  const head = question.trim().split(/\s+/).slice(0, 2)
  if (head.length >= 2 && /(구|군|시)$/.test(head[1])) return 'local'
  return 'broad'
}

/**
 * 소비자 질문 세트 생성.
 * 지역 또는 서비스가 없으면 빈 배열(측정 불가) — 호출부에서 게이트 처리한다.
 */
export function buildGeoQuestions(input: GeoQuestionInput): string[] {
  const { businessName, address, serviceAreas, serviceNames, activeAreas } = input
  const name = (businessName ?? '').trim()

  // ── 서비스 정리 ──
  const services: string[] = []
  const seenSvc = new Set<string>()
  for (const raw of serviceNames) {
    const s = normalizeService(raw)
    if (!s || seenSvc.has(s)) continue
    seenSvc.add(s)
    services.push(s)
    if (services.length >= MAX_SERVICES) break
  }
  // 서비스를 아직 등록하지 않은 업체도 측정은 되게 한다.
  // 청소업 전용 서비스라 '청소'는 항상 참인 폴백이고, 그래야 설정을 덜 채운 업체도
  // 첫 결과를 보고 "지역·서비스를 채우면 검색어가 늘어난다"는 다음 행동으로 이어진다.
  if (services.length === 0) services.push('청소')

  // ── 지역 정리 ──
  // 메인 = 사업장 주소의 시군구. 그다음 실제로 일한 지역, 그다음 출장 지역 순.
  const homeArea = toSearchArea(address)
  const areas: string[] = []
  const seenArea = new Set<string>()
  const pushArea = (a: string | null | undefined) => {
    const v = (a ?? '').trim()
    if (!v || seenArea.has(v)) return
    seenArea.add(v)
    areas.push(v)
  }
  pushArea(homeArea)
  for (const a of activeAreas ?? []) pushArea(toSearchArea(a))
  for (const a of serviceAreas ?? []) pushArea(toSearchArea(a))

  // 지역을 아직 안 넣은 업체 — 지역 검색어는 만들 수 없지만(지어내면 안 된다),
  // 브랜드 질문 하나는 지역 없이도 성립한다. "우리 이름으로 물으면 AI가 답하나?"는
  // 그 자체로 유효한 지표이고, 이걸 보여줘야 지역을 채울 이유가 생긴다.
  if (areas.length === 0) return name.length >= 2 ? [`${name} 후기`] : []

  const home = areas[0]
  const homeMetro = shortMetro(home)
  const svc0 = services[0]

  const out: string[] = []
  const push = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim()
    if (t && !out.includes(t) && out.length < MAX_QUESTIONS) out.push(t)
  }

  // 1) 브랜드 — 우리 이름으로 물었을 때 제대로 나오는가 (엔티티 인식 확인, 1개만)
  if (name.length >= 2) push(`${name} 후기`)

  // 2) 메인 지역 × 대표 서비스 — 가장 이길 확률이 높은 한 판
  push(`${home} ${svc0} 업체`)

  // 3) 가격형 — AI는 숫자로 답할 수 있는 페이지를 인용한다. 우리가 이길 수 있는 자리.
  push(`${home} ${svc0} 비용`)

  // 4) 실제로 일한 지역·출장 지역 × 대표 서비스 — 시공 사례라는 근거가 있는 곳부터
  for (const a of areas.slice(1, 1 + MAX_EXTRA_AREAS)) {
    push(`${a} ${svc0} 업체`)
  }

  // 5) 메인 지역 일반형 — 시군구 단위 '추천'은 광역보다 훨씬 해볼 만하다
  push(`${home} 청소업체 추천`)

  // 6) 나머지 서비스 × 메인 지역
  for (const s of services.slice(1)) push(`${home} ${s} 업체`)

  // 7) 증상·문제 축 1개 — 소비자는 서비스명보다 겪는 문제로 검색하는 경우가 많다
  const svcJoined = services.join(' ')
  const SYMPTOM_RULES: { re: RegExp; q: (h: string) => string }[] = [
    { re: /에어컨/, q: (h) => `${h} 에어컨 곰팡이 냄새 제거 업체` },
    { re: /입주|이사/, q: (h) => `${h} 새집증후군 청소 업체` },
    { re: /욕실|화장실/, q: (h) => `${h} 욕실 곰팡이 제거 업체` },
    { re: /냉장고/, q: (h) => `${h} 냉장고 냄새 제거 청소` },
    { re: /준공|인테리어/, q: (h) => `${h} 인테리어 먼지 입주 전 청소` },
  ]
  for (const rule of SYMPTOM_RULES) {
    if (rule.re.test(svcJoined)) {
      push(rule.q(home))
      break
    }
  }

  // 8) 광역 벤치마크 1개 — 플랫폼이 이기는 판이지만 추세를 보기 위해 남긴다
  if (homeMetro && homeMetro !== home) push(`${homeMetro} ${svc0} 추천`)

  return out.slice(0, MAX_QUESTIONS)
}
