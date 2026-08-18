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
  // 'brand'는 더 이상 만들지 않지만, 예전에 저장된 결과를 읽을 때를 위해 판정은 남긴다
  if (name.length >= 2 && question.includes(name)) return 'brand'
  if (/(비용|가격|얼마|평당)/.test(question)) return 'price'
  // 문장 어디든 "광역 시군구"가 들어 있으면 우리가 겨뤄볼 만한 동네 질문으로 본다.
  // 예: "울산 울주군에 사무실 정기청소 맡길 업체…" → local
  //     "울산에서 사무실 정기청소 잘하는 업체…"     → broad(광역뿐, 플랫폼이 이기는 판)
  if (/[가-힣]{2,4}\s[가-힣]{1,6}(구|군|시)/.test(question)) return 'local'
  return 'broad'
}

/**
 * 소비자 질문 세트 생성.
 * 지역이 없으면 빈 배열(측정 불가) — 호출부에서 게이트 처리한다.
 *
 * ── 왜 '문장'인가 (2026-08-19) ──
 * 처음엔 "울산 울주군 사무실 정기청소 업체"처럼 검색창에 치는 키워드로 물었다.
 * 그런데 사람들은 AI에 그렇게 묻지 않는다. 말하듯이, 조건을 붙여서 묻는다.
 *   "울산에 사무실 청소하는 업체 추천해주세요. 정기적인 관리를 받고 싶어요.
 *    영업 외 시간에 했으면 좋겠어요. 잘하는 곳으로 알려주세요."
 *
 * 이 차이가 결과를 가른다. 짧은 키워드형 질문은 AI가 구글 지도에서 답을 고르지만,
 * 길고 조건이 붙은 질문은 블로그·홈페이지 글을 읽고 답한다. 우리 무기가 콘텐츠라
 * 문장형으로 물어야 우리가 이길 수 있는 판에서 재게 된다.
 *
 * 브랜드 질문("○○ 후기")은 뺐다. 손님은 우리 이름을 모르는 상태로 찾는다 —
 * 이름을 아는 사람만 던지는 질문은 실제 유입과 무관하고 승률만 부풀린다.
 */
export function buildGeoQuestions(input: GeoQuestionInput): string[] {
  const { address, serviceAreas, serviceNames, activeAreas } = input

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
  // 서비스를 아직 등록하지 않은 업체도 측정은 되게 한다(청소업 전용 서비스라 '청소'는 항상 참).
  if (services.length === 0) services.push('청소')

  // ── 지역 정리 ── 메인 = 사업장 주소의 시군구. 그다음 실제로 일한 지역, 그다음 출장 지역.
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
  if (areas.length === 0) return []

  const home = areas[0]
  const homeMetro = shortMetro(home)
  const svc0 = services[0]

  const out: string[] = []
  const push = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim()
    if (t && !out.includes(t) && out.length < MAX_QUESTIONS) out.push(t)
  }

  // 서비스 성격에 맞는 '조건 한 줄' — 손님이 실제로 덧붙이는 사정을 담는다.
  // 조건이 붙어야 AI가 목록이 아니라 글을 읽고 답한다.
  const conditionFor = (svc: string): string => {
    if (/정기|관리/.test(svc)) return '정기적으로 관리받고 싶어요. 영업 시간 끝난 뒤에 와주면 좋겠어요.'
    if (/입주|이사|준공|인테리어/.test(svc)) return '입주 전에 마무리로 깨끗하게 하고 싶어요.'
    if (/에어컨/.test(svc)) return '오래 써서 곰팡이 냄새가 나요.'
    if (/공장|창고/.test(svc)) return '작업에 지장 없게 주말이나 야간에 해줬으면 해요.'
    if (/상업|매장|카페|사무실/.test(svc)) return '영업에 방해되지 않는 시간에 해줬으면 해요.'
    return '꼼꼼하게 해주는 곳이면 좋겠어요.'
  }

  // 1) 대표 서비스 — 추천 요청 + 조건 (가장 많이 던지는 형태)
  push(`${home}에 ${svc0} 맡길 업체 추천해주세요. ${conditionFor(svc0)} 잘하는 곳으로 알려주세요.`)

  // 2) 가격 — AI는 숫자로 답할 수 있는 글을 인용한다. 우리가 이길 수 있는 자리.
  push(`${home}에서 ${svc0} 맡기면 비용이 얼마나 드나요? 대략적인 가격대를 알려주세요.`)

  // 3) 고르는 기준 — 계약 전에 실제로 많이 묻는 질문. 안내형 글이 인용되는 자리.
  push(`${home}에서 ${svc0} 업체를 고를 때 뭘 확인해야 하나요? 괜찮은 곳도 같이 추천해주세요.`)

  // 4) 실제로 일한 지역·출장 지역 — 시공 사례라는 근거가 있는 곳부터
  for (const a of areas.slice(1, 1 + MAX_EXTRA_AREAS)) {
    push(`${a}에서 ${svc0} 잘하는 업체 있을까요? 추천해주세요.`)
  }

  // 5) 나머지 서비스 — 서비스마다 사정이 다르므로 조건도 그에 맞게
  for (const s of services.slice(1)) {
    push(`${home}에 ${s} 맡길 곳을 찾고 있어요. ${conditionFor(s)} 어디가 좋을까요?`)
  }

  // 6) 문제 축 — 손님은 서비스명보다 겪는 문제로 묻는다
  const svcJoined = services.join(' ')
  const SYMPTOM_RULES: { re: RegExp; q: (h: string) => string }[] = [
    { re: /에어컨/, q: (h) => `${h}인데 에어컨에서 곰팡이 냄새가 나요. 청소 맡길 업체 추천해주세요.` },
    { re: /입주|이사/, q: (h) => `${h}로 이사 가는데 입주 전에 청소를 맡기고 싶어요. 어디가 괜찮을까요?` },
    { re: /욕실|화장실/, q: (h) => `${h}인데 욕실 곰팡이가 심해요. 청소 업체 추천해주세요.` },
    { re: /준공|인테리어/, q: (h) => `${h}에서 인테리어 공사가 끝났는데 먼지 청소를 맡길 곳이 필요해요.` },
    { re: /사무실|정기|상업|매장/, q: (h) => `${h}에서 사업장을 운영하는데 청소를 정기적으로 맡기고 싶어요. 어떻게 알아보면 되나요?` },
  ]
  for (const rule of SYMPTOM_RULES) {
    if (rule.re.test(svcJoined)) {
      push(rule.q(home))
      break
    }
  }

  // 7) 광역 벤치마크 1개 — 플랫폼이 이기는 판이지만 추세를 보려고 남긴다
  if (homeMetro && homeMetro !== home) {
    push(`${homeMetro}에서 ${svc0} 잘하는 업체 추천해주세요.`)
  }

  return out.slice(0, MAX_QUESTIONS)
}
