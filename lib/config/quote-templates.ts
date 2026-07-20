// 청소 업종 견적 플랜 구성 템플릿 (많이 쓰는 구성)
//
// 다른 청소업체들이 실제로 많이 쓰는 기본/추천/프리미엄 구성 예시.
// 서비스 항목의 "플랜 구성 항목 설정"에서 사장님이 골라 불러온 뒤 자유롭게 수정할 수 있다.
// 지금은 업계 표준(입주/이사청소 평당 12,000~15,000원, 새집증후군 연무 평당 +5,000,
// 가전 내부 대당 +10,000 등)을 근거로 한 정적 템플릿이며,
// 나중에 실제 고객사 사용 데이터가 쌓이면 이 목록을 데이터 기반으로 갱신한다.

export interface QuoteTemplate {
  id: string
  // 목록에 보이는 이름 — "○○업체들이 많이 쓰는 구성"
  label: string
  // 한 줄 설명
  description: string
  // 서비스 이름/분류에 이 키워드가 들어가면 이 템플릿을 추천 노출
  keywords: string[]
  // 기본 플랜에 포함되는 핵심 작업
  good: string[]
  // 추천 플랜에 "추가로" 제공하는 작업 (기본 항목은 자동 포함)
  better: string[]
  // 프리미엄 플랜에 "추가로" 제공하는 작업 (기본+추천 항목은 자동 포함)
  best: string[]
}

// 입주/이사/준공 청소 — 가장 많이 쓰는 앵커 서비스
const MOVE_IN: QuoteTemplate = {
  id: 'move_in',
  label: '입주·이사청소 인기 구성',
  description: '입주/이사청소 업체가 가장 많이 쓰는 3단계 구성',
  keywords: ['입주', '이사', '준공', '입주청소', '이사청소'],
  good: [
    '전체 공간 먼지 제거·바닥 청소',
    '주방 싱크대·수납장 외부',
    '욕실 타일·변기·세면대',
    '창틀·문틀 기본 청소',
  ],
  better: [
    '새집증후군 연무 소독',
    '베란다·창문 안팎 청소',
    '주방 후드·가스레인지 기름때',
  ],
  best: [
    '냉장고·세탁기 내부 세척',
    '붙박이장 내부 청소',
    '항균·살균 시공',
    '걸레받이·조명 디테일',
  ],
}

// 거주/생활/정기 청소 — 재방문·단골(LTV)용
const RECURRING: QuoteTemplate = {
  id: 'recurring',
  label: '거주·정기청소 인기 구성',
  description: '생활청소·정기 방문 업체가 많이 쓰는 구성',
  keywords: ['정기', '거주', '생활', '가사', '홈케어', '주기'],
  good: [
    '먼지 제거·바닥 청소기·물걸레',
    '주방 표면·설거지 정리',
    '욕실 기본 청소',
    '쓰레기 정리',
  ],
  better: [
    '주방 기름때·후드·전자레인지',
    '침구 정리·정돈',
    '유리·거울 닦기',
  ],
  best: [
    '냉장고 내부 정리',
    '창틀·걸레받이 디테일',
    '베란다 청소',
  ],
}

// 에어컨 청소 — 유형별 단가 기반
const AIRCON: QuoteTemplate = {
  id: 'aircon',
  label: '에어컨청소 인기 구성',
  description: '에어컨 전문 세척 업체가 많이 쓰는 구성',
  keywords: ['에어컨', '냉방', '실외기'],
  good: [
    '커버·필터 분리 세척',
    '송풍구 먼지 제거',
  ],
  better: [
    '완전분해 열교환기 고압세척',
    '항균 살균 코팅',
  ],
  best: [
    '실외기 세척',
    '배수라인 살균',
    '곰팡이 방지 시공',
  ],
}

// 가전 내부 청소 (냉장고·세탁기 등)
const APPLIANCE: QuoteTemplate = {
  id: 'appliance',
  label: '가전 내부청소 인기 구성',
  description: '냉장고·세탁기 등 가전 세척 구성',
  keywords: ['냉장고', '세탁기', '가전', '전자제품', '후드', '오븐'],
  good: [
    '외부·손잡이 세척',
    '눈에 보이는 오염 제거',
  ],
  better: [
    '내부 분리 세척',
    '고무패킹·틈새 곰팡이 제거',
  ],
  best: [
    '항균 살균 처리',
    '탈취 마감',
  ],
}

// 새집증후군·방역·소독
const STERILIZE: QuoteTemplate = {
  id: 'sterilize',
  label: '새집증후군·소독 인기 구성',
  description: '연무 소독·새집증후군 시공 구성',
  keywords: ['새집', '곰팡이', '방역', '소독', '피톤치드', '항균'],
  good: [
    '오염 부위 진단·표면 처리',
  ],
  better: [
    '연무 소독 시공',
    '친환경 약품 도포',
  ],
  best: [
    '광촉매 코팅',
    '재발 방지 마감',
    '공기질 측정',
  ],
}

// 사무실·상가·병원 등 상업공간 (B2B)
const COMMERCIAL: QuoteTemplate = {
  id: 'commercial',
  label: '상업공간(사무실·상가) 인기 구성',
  description: '사무실·상가·매장 등 법인 청소 구성',
  keywords: ['사무실', '상가', '오피스', '매장', '병원', '상업', '입점', '건물'],
  good: [
    '바닥·집기 먼지 제거',
    '공용부·화장실 청소',
  ],
  better: [
    '유리·새시 디테일 청소',
    '분진 제거',
    '카펫·바닥 얼룩 처리',
  ],
  best: [
    '바닥 왁스 코팅',
    '정기 유지관리 1회 포함',
  ],
}

// 어떤 서비스에도 쓸 수 있는 기본 템플릿 (매칭 안 될 때 항상 하나는 보이도록)
const GENERIC: QuoteTemplate = {
  id: 'generic',
  label: '기본 3단계 구성',
  description: '어떤 서비스에도 쓸 수 있는 무난한 구성',
  keywords: [],
  good: [
    '기본 청소 작업',
    '눈에 보이는 오염 제거',
  ],
  better: [
    '세부 부위 추가 청소',
    '얼룩·기름때 집중 처리',
  ],
  best: [
    '항균·살균 마감',
    '디테일 마감 작업',
  ],
}

const ALL_TEMPLATES: QuoteTemplate[] = [
  MOVE_IN,
  RECURRING,
  AIRCON,
  APPLIANCE,
  STERILIZE,
  COMMERCIAL,
]

// 서비스 이름/분류에 맞는 템플릿을 추천 순서로 반환.
// 매칭되는 게 있으면 그것들을 먼저, 없으면(또는 항상 마지막에) 기본 템플릿을 붙인다.
export function getTemplatesForService(
  name: string,
  category?: string | null
): QuoteTemplate[] {
  const haystack = `${name} ${category ?? ''}`.toLowerCase()
  const matched = ALL_TEMPLATES.filter((t) =>
    t.keywords.some((kw) => haystack.includes(kw.toLowerCase()))
  )
  // 매칭 결과 + 기본 템플릿(중복 제거)
  const result = [...matched]
  if (!result.some((t) => t.id === GENERIC.id)) result.push(GENERIC)
  return result
}
