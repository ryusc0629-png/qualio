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

// 한 번에 물어보는 질문 수.
//
// 예전엔 12개였는데, 그건 비용 때문이 아니라 '하나씩 순서대로' 묻느라 그 이상은
// 함수 제한시간(5분)에 걸렸기 때문이다. 이제 동시에 던지므로 시간 제약이 풀렸다.
// 넓게 물을수록 어디서 새는지 정확히 보이므로 30개로 올린다.
// (질문 수 × 엔진 수 = 호출 수. 30개 × 3엔진 = 측정 1회에 90번)
const MAX_QUESTIONS = 30
// 조합에 쓸 상위 서비스 개수 — 너무 많으면 질문이 희석돼 핵심 서비스 신호가 약해진다.
const MAX_SERVICES = 3
// 메인 지역 외 추가로 공략할 시군구 최대 개수.
const MAX_EXTRA_AREAS = 5

/** 질문의 성격 — 카드에서 묶어 보여주고, 승패를 해석할 때 쓴다. */
export type GeoQuestionKind = 'brand' | 'price' | 'local' | 'broad'

// 광역 단위 정식명 → 사람들이 실제로 쓰는 약칭.
// 접미사만 떼면 "경상북도"가 "경상북"이 된다(실제로 "경상북 경주시" 질문이 만들어졌다).
const METRO_SHORT: Record<string, string> = {
  서울특별시: '서울', 인천광역시: '인천', 경기도: '경기',
  부산광역시: '부산', 울산광역시: '울산', 경상남도: '경남',
  대구광역시: '대구', 경상북도: '경북', 광주광역시: '광주',
  전라남도: '전남', 전북특별자치도: '전북', 대전광역시: '대전',
  세종특별자치시: '세종', 충청남도: '충남', 충청북도: '충북',
  강원특별자치도: '강원', 제주특별자치도: '제주',
}

// 지역 문자열에서 광역 단위명만 남긴다. "울산광역시"→"울산", "경상북도"→"경북"
function shortMetro(raw: string | null | undefined): string {
  const first = (raw ?? '').trim().split(/\s+/)[0] ?? ''
  if (METRO_SHORT[first]) return METRO_SHORT[first]
  // 표에 없는 형태(이미 줄인 이름 등)는 접미사만 떼서 쓴다
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
  // 도 소속이면 '시'가 먼저다 — "경기 성남시"라고 하지 "경기 분당구"라고 하지 않는다.
  // 광역시·특별시는 si가 비어 있어 자연히 구(區)가 쓰인다("울산 남구").
  const local = parts.si ?? parts.gu ?? parts.gun ?? null
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

/** 이번 주 키 — 'YYYY-Www'(KST). 같은 주엔 같은 질문이 나오게 하는 씨앗. */
export function currentWeekKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const year = kst.getUTCFullYear()
  // 그 해 1월 1일부터 몇 번째 주인지 (정확한 ISO 주차까지 갈 필요는 없다 — 씨앗이면 충분)
  const start = Date.UTC(year, 0, 1)
  const week = Math.floor((kst.getTime() - start) / (7 * 24 * 60 * 60 * 1000)) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** 문자열 → 정수 (회전 시작점 결정용). 같은 입력이면 항상 같은 값. */
function seedOf(text: string): number {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h
}

// 손님이 실제로 던지는 문형 — 의도별로 모아 둔다.
//
// 왜 이렇게 많이 두나: 사람들은 생각지도 못한 방식으로 묻는다. 몇 개만 반복해서 재면
// 그 몇 개에서만 이기고 나머지는 영영 모른다. 넓게 물어야 어디서 새고 있는지 보인다.
// 다만 매번 전부 돌리면 비용이 감당이 안 되므로, 큰 풀을 만들어 두고 주마다 돌려 뽑는다.
const QUESTION_TEMPLATES: ((area: string, svc: string, cond: string) => string)[] = [
  (a, s, c) => `${a}에 ${s} 맡길 업체 추천해주세요. ${c} 잘하는 곳으로 알려주세요.`,
  (a, s) => `${a}에서 ${s} 맡기면 비용이 얼마나 드나요? 대략적인 가격대를 알려주세요.`,
  (a, s) => `${a}에서 ${s} 업체를 고를 때 뭘 확인해야 하나요? 괜찮은 곳도 같이 추천해주세요.`,
  (a, s) => `${a} ${s} 업체 중에 후기 좋은 곳 알려주세요.`,
  (a, s) => `${a}에서 ${s} 잘하는 곳 있나요? 믿고 맡길 만한 데로 알려주세요.`,
  (a, s) => `${a}에 ${s} 급하게 맡겨야 하는데 바로 와줄 수 있는 업체 있을까요?`,
  (a, s) => `${a} ${s} 가격 비교해주세요. 어디가 합리적인가요?`,
  (a, s) => `${a}에서 ${s} 처음 맡겨보는데 어떻게 진행되나요? 업체도 추천해주세요.`,
  (a, s) => `${a} ${s} 업체 두세 곳만 비교해서 알려주세요.`,
  (a, s) => `${a}에서 ${s} 계약하려는데 주의할 점이 뭔가요?`,
  (a, s) => `${a} ${s} 저렴하면서 꼼꼼하게 해주는 곳 있을까요?`,
  (a, s) => `${a}에 ${s} 전문으로 하는 업체 어디가 있나요?`,
  (a, s) => `${a}에서 ${s} 견적 받아보고 싶은데 어디에 문의하면 되나요?`,
  (a, s) => `${a} ${s} 업체 중에 사업자 등록되고 보험 있는 곳으로 추천해주세요.`,
  (a, s, c) => `${a}에 ${s} 맡길 곳을 찾고 있어요. ${c} 어디가 좋을까요?`,
  (a, s) => `${a}에서 ${s} 오래 맡길 만한 업체 추천해주세요. 자주 바꾸고 싶지 않아요.`,
]

/**
 * 소비자 질문 세트 생성.
 * 지역이 없으면 빈 배열(측정 불가) — 호출부에서 게이트 처리한다.
 *
 * ── 왜 '문장'인가 (2026-08-19) ──
 * 처음엔 "울산 울주군 사무실 정기청소 업체"처럼 검색창에 치는 키워드로 물었다.
 * 그런데 사람들은 AI에 그렇게 묻지 않는다. 말하듯이, 사정을 붙여서 묻는다.
 * 짧은 키워드형 질문은 AI가 구글 지도에서 답을 고르지만, 길고 조건이 붙은 질문은
 * 블로그·홈페이지 글을 읽고 답한다. 우리 무기가 콘텐츠라 문장형으로 물어야
 * 우리가 이길 수 있는 판에서 재게 된다.
 *
 * ── 왜 '돌려가며' 묻나 (2026-08-19) ──
 * 같은 12개만 매주 재면 그 12개 안에서만 성적을 안다. 손님은 생각지도 못한 방식으로
 * 묻기 때문에, 넓게 물어야 어디서 새고 있는지 드러난다. 그래서 지역×서비스×문형으로
 * 큰 풀(수십~수백 개)을 만들어 두고 주마다 다른 조합을 뽑는다.
 * 단 앞의 3개(대표 지역·대표 서비스)는 고정이다 — 추세 그래프가 끊기면 안 되므로.
 * 같은 주엔 항상 같은 질문이 나온다(멱등).
 *
 * 브랜드 질문("○○ 후기")은 뺐다. 손님은 우리 이름을 모르는 채로 찾는다.
 */
export function buildGeoQuestions(input: GeoQuestionInput, weekKey = currentWeekKey()): string[] {
  const { address, serviceAreas, serviceNames } = input

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

  // ── 지역 정리 ── 메인 = 사업장 주소의 시군구. 그다음 설정된 출장 지역.
  const homeArea = toSearchArea(address)
  const areas: string[] = []
  const seenArea = new Set<string>()
  const pushArea = (a: string | null | undefined) => {
    const v = (a ?? '').trim()
    if (!v || seenArea.has(v)) return
    seenArea.add(v)
    areas.push(v)
  }
  // 사업장 주소가 먼저, 그다음 사장님이 넣은 출장 지역 순서 그대로.
  // 예약 주소로 지역을 추론하지 않는다 — 테스트 예약 한 건에 엉뚱한 지역이 끼어든다.
  pushArea(homeArea)
  for (const a of serviceAreas ?? []) pushArea(toSearchArea(a))
  if (areas.length === 0) return []

  const home = areas[0]
  const homeMetro = shortMetro(home)
  const svc0 = services[0]

  const out: string[] = []
  const push = (q: string | null | undefined) => {
    const t = (q ?? '').replace(/\s+/g, ' ').trim()
    if (t && !out.includes(t) && out.length < MAX_QUESTIONS) out.push(t)
  }

  // 서비스 성격에 맞는 '조건 한 줄' — 손님이 실제로 덧붙이는 사정을 담는다.
  const conditionFor = (svc: string): string => {
    if (/정기|관리/.test(svc)) return '정기적으로 관리받고 싶어요. 영업 시간 끝난 뒤에 와주면 좋겠어요.'
    if (/입주|이사|준공|인테리어/.test(svc)) return '입주 전에 마무리로 깨끗하게 하고 싶어요.'
    if (/에어컨/.test(svc)) return '오래 써서 곰팡이 냄새가 나요.'
    if (/공장|창고/.test(svc)) return '작업에 지장 없게 주말이나 야간에 해줬으면 해요.'
    if (/상업|매장|카페|사무실/.test(svc)) return '영업에 방해되지 않는 시간에 해줬으면 해요.'
    return '꼼꼼하게 해주는 곳이면 좋겠어요.'
  }

  // ── 고정 3개 — 추세 그래프가 끊기지 않도록 매주 같은 자리를 지킨다 ──
  push(QUESTION_TEMPLATES[0](home, svc0, conditionFor(svc0)))
  push(QUESTION_TEMPLATES[1](home, svc0, ''))
  push(QUESTION_TEMPLATES[2](home, svc0, ''))

  // ── 회전 풀 — 지역 × 서비스 × 문형 전부 조합 ──
  const pool: string[] = []
  const usableAreas = areas.slice(0, 1 + MAX_EXTRA_AREAS)
  for (const area of usableAreas) {
    for (const svc of services) {
      const cond = conditionFor(svc)
      for (const tpl of QUESTION_TEMPLATES) pool.push(tpl(area, svc, cond))
    }
  }

  // 문제 축 — 손님은 서비스명보다 겪는 문제로 묻는다. 이것도 풀에 넣어 돌린다.
  const svcJoined = services.join(' ')
  const SYMPTOM_RULES: { re: RegExp; q: (h: string) => string }[] = [
    { re: /에어컨/, q: (h) => `${h}인데 에어컨에서 곰팡이 냄새가 나요. 청소 맡길 업체 추천해주세요.` },
    { re: /입주|이사/, q: (h) => `${h}로 이사 가는데 입주 전에 청소를 맡기고 싶어요. 어디가 괜찮을까요?` },
    { re: /욕실|화장실/, q: (h) => `${h}인데 욕실 곰팡이가 심해요. 청소 업체 추천해주세요.` },
    { re: /준공|인테리어/, q: (h) => `${h}에서 인테리어 공사가 끝났는데 먼지 청소를 맡길 곳이 필요해요.` },
    { re: /사무실|정기|상업|매장/, q: (h) => `${h}에서 사업장을 운영하는데 청소를 정기적으로 맡기고 싶어요. 어떻게 알아보면 되나요?` },
    { re: /공장|창고/, q: (h) => `${h} 공장 위생 관리를 맡기려는데 산업 현장 경험 있는 업체로 추천해주세요.` },
  ]
  for (const area of usableAreas) {
    for (const rule of SYMPTOM_RULES) {
      if (rule.re.test(svcJoined)) pool.push(rule.q(area))
    }
  }

  // 광역 벤치마크 — 플랫폼이 이기는 판이지만 추세를 보려고 하나 남긴다(회전 대상 아님)
  const broad = homeMetro && homeMetro !== home
    ? `${homeMetro}에서 ${svc0} 잘하는 업체 추천해주세요.`
    : null

  // 이번 주 시작점부터 풀을 훑어 남은 자리를 채운다.
  // 업체마다 다른 지점에서 시작하도록 씨앗에 지역·서비스를 섞는다(모든 업체가 같은 주에
  // 같은 문형만 도는 걸 막는다).
  const reserved = broad ? 1 : 0
  if (pool.length > 0) {
    const seed = seedOf(`${weekKey}|${home}|${svc0}`)
    for (let i = 0; i < pool.length && out.length < MAX_QUESTIONS - reserved; i++) {
      push(pool[(seed + i) % pool.length])
    }
  }

  push(broad)

  return out.slice(0, MAX_QUESTIONS)
}
