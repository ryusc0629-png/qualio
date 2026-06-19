// 금액을 좁은 카드에서도 넘치지 않게 만원/억원 단위로 축약 표시
// 12,300,000 → "1230만원", 123,400,000 → "1.2억원", 8,000 → "8,000원", 0 이하 → "—"
export function formatCompactKRW(n: number): string {
  if (!n || n <= 0) return '—'
  if (n >= 100_000_000) {
    // 0.1억 단위로 반올림 (예: 1.2억원)
    const eok = Math.round(n / 10_000_000) / 10
    return `${eok}억원`
  }
  if (n >= 10_000) {
    // 만원 단위 반올림 (만 자리는 4자리 이하라 쉼표 불필요 — 기존 '누적 N만원' 표기와 통일)
    return `${Math.round(n / 10_000)}만원`
  }
  return `${n.toLocaleString('ko-KR')}원`
}
