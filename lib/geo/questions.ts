import { parseKoreanRegion } from '@/lib/address/parse-region'

// GEO 측정용 "소비자 질문 세트" 생성 — 지역×서비스×구매의도를 결정적으로 조합한다.
// AI를 쓰지 않는 이유: 측정 질문은 매번 같아야 추세 비교가 유효하고, 업체마다 매달
// AI를 돌리면 비용·지연·변동성이 생긴다. 소비자가 실제로 AI/검색에 던지는 문형은
// "{지역} {서비스} 추천/잘하는 곳/비용"으로 충분히 패턴화되므로 템플릿이 더 안정적이다.

// 질문 상한 — Perplexity 검색 호출 비용을 업체당 예측 가능하게 묶는다.
const MAX_QUESTIONS = 12
// 조합에 쓸 상위 서비스 개수 — 너무 많으면 질문이 희석돼 핵심 서비스 신호가 약해진다.
const MAX_SERVICES = 4

// 서비스명을 소비자 검색어 형태로 정리 — 괄호·단위·가격 수식을 떼고 핵심 명사만 남김.
// 예: "입주청소 (평당)" → "입주청소", "에어컨 청소(벽걸이)" → "에어컨 청소"
function normalizeService(name: string): string {
  return name
    .replace(/\(.*$/, '') // 괄호 이후 제거
    .replace(/\d[\d,]*\s*원.*$/, '') // 가격 표기 제거
    .replace(/\s+/g, ' ')
    .trim()
}

// 소비자 질문 세트 생성 — 핵심 지역(구/시)을 중심으로, 상위 지역·동을 일부 섞는다.
// 지역 또는 서비스가 없으면 빈 배열(측정 불가) — 호출부에서 게이트 처리.
export function buildGeoQuestions(
  address: string | null | undefined,
  serviceNames: string[],
): string[] {
  const { primaryLocal, dong, si, sido } = parseKoreanRegion(address)
  const core = primaryLocal ?? si ?? sido // 대표 지역(주로 구/군)
  if (!core) return []

  // 상위 지역 하나(핵심 지역과 다른 시/도) — 넓은 검색도 일부 포착
  const wider = [si, sido].find((v): v is string => !!v && v !== core) ?? null

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

  // 1) 핵심 지역 × 상위 서비스(최대 3) × "추천"
  for (const s of services.slice(0, 3)) push(`${core} ${s} 추천`)

  // 2) 핵심 지역 × 대표 서비스 × 다른 구매 의도
  push(`${core} ${services[0]} 잘하는 곳`)
  push(`${core} ${services[0]} 비용`)

  // 3) 지역 일반형 — 소비자가 서비스 특정 없이 던지는 질문
  push(`${core} 청소업체 추천`)

  // 4) 동 단위(있으면) — 초로컬 질문 1개
  if (dong) push(`${core} ${dong} ${services[0]} 추천`)

  // 5) 상위 지역(있으면) × 서비스 1~2개 — 넓은 검색 포착
  if (wider) {
    push(`${wider} ${services[0]} 추천`)
    if (services[1]) push(`${wider} ${services[1]} 업체 추천`)
  }

  return out.slice(0, MAX_QUESTIONS)
}
