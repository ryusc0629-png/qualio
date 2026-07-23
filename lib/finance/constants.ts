// 매출·지출 장부 공용 상수 — 서버 페이지와 입력 폼이 같은 분류를 쓰도록 한곳에서 관리

// 매출 분류(청소업체 기준)
export const REVENUE_CATEGORIES = [
  '정기청소',
  '입주·이사청소',
  '상가·사무실',
  '에어컨·특수청소',
  '기타 매출',
] as const

// 지출(매입) 분류 — 그날그날 나가는 변동비
export const EXPENSE_CATEGORIES = [
  '인건비',
  '자재·소모품',
  '차량·유류비',
  '광고·홍보',
  '수수료',
  '기타 지출',
] as const

// 고정비 추천 항목(빠른 입력용 칩)
export const FIXED_COST_PRESETS = [
  '사무실 임대료',
  '차량 할부·리스',
  '보험료',
  '통신비',
  '급여',
  '대출 이자',
  '구독료',
] as const

// 분류별 도넛/막대 색상(에메랄드 계열 + 보조색). CSS 변수 chart-1~5 + 회색.
export const CATEGORY_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#94a3b8', // slate-400 — '기타'용
]

// 데이터가 없을 때 쓸 기본 공헌이익률(청소업 서비스 특성상 높은 편)
export const DEFAULT_CONTRIBUTION_MARGIN = 0.65

// ₩ 전체 표기 (예: 1,250,000원)
export function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}

// 큰 금액 축약 표기 (예: 1,250,000 → 125만, 12,000,000 → 1,200만)
export function formatManwon(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs < 10000) return `${sign}${abs.toLocaleString('ko-KR')}원`
  const man = Math.round(abs / 10000)
  return `${sign}${man.toLocaleString('ko-KR')}만`
}
