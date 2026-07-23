import { parseKoreanRegion } from '@/lib/address/parse-region'

// GEO 측정용 "소비자 질문 세트" 생성 — 지역×서비스×구매의도를 결정적으로 조합한다.
// AI를 쓰지 않는 이유: 측정 질문은 매번 같아야 추세 비교가 유효하고, 업체마다 매달
// AI를 돌리면 비용·지연·변동성이 생긴다. 소비자가 실제로 AI/검색에 던지는 문형은
// "{지역} {서비스} 추천/잘하는 곳/비용"으로 충분히 패턴화되므로 템플릿이 더 안정적이다.
//
// [지역 선정 규칙 — 중요]
// 업체 주소의 시/도(예: 울산)를 "메인 지역"으로 최우선 배치하고, 영업지역(service_areas)에
// 등장하는 다른 광역시(부산·대구 등)는 보조로 소수만 넣는다. 주소가 '울주군' 같은 군 단위라도
// 소비자는 "울산 ○○청소"로 검색하므로 광역시(시/도) 단위로 질문을 만든다.

// 질문 상한 — Perplexity 검색 호출 비용을 업체당 예측 가능하게 묶는다.
const MAX_QUESTIONS = 12
// 조합에 쓸 상위 서비스 개수 — 너무 많으면 질문이 희석돼 핵심 서비스 신호가 약해진다.
const MAX_SERVICES = 3
// 보조 지역(메인 외 광역시) 최대 개수 — 메인 지역에 집중하고 곁가지는 최소화.
const MAX_SECONDARY_METROS = 2

// 지역 문자열에서 소비자가 검색에 쓰는 광역 단위명만 남긴다.
// "울산광역시"→"울산", "부산 사하구"→"부산", "경기도"→"경기", "수원시"→"수원"
function shortMetro(raw: string | null | undefined): string {
  const first = (raw ?? '').trim().split(/\s+/)[0] ?? ''
  return first.replace(/(특별자치도|특별자치시|특별시|광역시|자치도|도|시)$/, '') || first
}

// 서비스명을 소비자 검색어 형태로 정리 — 괄호·단위·가격 수식을 떼고 핵심 명사만 남김.
// 예: "입주청소 (평당)" → "입주청소", "에어컨 청소(벽걸이)" → "에어컨 청소"
function normalizeService(name: string): string {
  return name
    .replace(/\(.*$/, '') // 괄호 이후 제거
    .replace(/\d[\d,]*\s*원.*$/, '') // 가격 표기 제거
    .replace(/[/·].*$/, '') // 슬래시·가운뎃점 이후 제거(예: "입주/이사 청소"→"입주")
    .replace(/\s+/g, ' ')
    .trim()
}

// 소비자 질문 세트 생성 — 메인 지역(주소 시/도)에 집중, 영업지역의 다른 광역시는 보조.
// 지역 또는 서비스가 없으면 빈 배열(측정 불가) — 호출부에서 게이트 처리.
export function buildGeoQuestions(
  address: string | null | undefined,
  serviceAreas: string[] | null | undefined,
  serviceNames: string[],
): string[] {
  // 메인 지역 = 주소의 시/도(사장님이 '내 지역'으로 인지하는 광역 단위)
  const parts = parseKoreanRegion(address)
  const homeMetro = parts.sido ? shortMetro(parts.sido) : parts.si ? shortMetro(parts.si) : null

  // 지역 목록: 메인 먼저, 그다음 영업지역에 등장하는 다른 광역시(중복 제거)
  const metros: string[] = []
  const seenMetro = new Set<string>()
  const pushMetro = (m: string | null) => {
    if (m && !seenMetro.has(m)) {
      seenMetro.add(m)
      metros.push(m)
    }
  }
  pushMetro(homeMetro)
  for (const a of serviceAreas ?? []) pushMetro(shortMetro(a))
  if (metros.length === 0) return []

  // 서비스 정리 → 중복 제거 → 상위 N개
  const services: string[] = []
  const seenSvc = new Set<string>()
  for (const raw of serviceNames) {
    const s = normalizeService(raw)
    if (!s || seenSvc.has(s)) continue
    seenSvc.add(s)
    services.push(s)
    if (services.length >= MAX_SERVICES) break
  }
  if (services.length === 0) return []

  const out: string[] = []
  const push = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim()
    if (t && !out.includes(t)) out.push(t)
  }

  const home = metros[0]

  // 1) 메인 지역 × 상위 서비스 × "추천"
  for (const s of services) push(`${home} ${s} 추천`)

  // 2) 메인 지역 × 대표 서비스 × 다른 구매 의도
  push(`${home} ${services[0]} 잘하는 곳`)

  // 3) 메인 지역 일반형 — 서비스 특정 없이 던지는 질문
  push(`${home} 청소업체 추천`)

  // 4) 보조 지역(다른 광역시) × 대표 서비스 1개씩 — 넓은 영업권 일부 포착
  for (const m of metros.slice(1, 1 + MAX_SECONDARY_METROS)) {
    push(`${m} ${services[0]} 추천`)
  }

  return out.slice(0, MAX_QUESTIONS)
}
