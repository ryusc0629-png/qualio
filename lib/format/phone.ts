// 전화번호 입력 정리 — 숫자만 남기고 한국 전화번호 형식으로 하이픈 자동 삽입
// 연락처 칸에 글자가 입력되던 문제를 막기 위해 onChange에서 사용한다.

/** 숫자 이외 문자 제거 */
export const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')

/**
 * 한국 전화번호 자동 하이픈 포맷
 * - 02(서울 지역번호): 02-1234-5678 / 02-123-4567
 * - 010·070 등 3자리 국번 휴대폰·일반: 010-1234-5678 / 0xx-123-4567
 */
export function formatPhone(value: string): string {
  const d = digitsOnly(value).slice(0, 11)

  // 서울 지역번호(02) — 2자리 국번
  if (d.startsWith('02')) {
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`
  }

  // 그 외(010·070·031 등) — 3자리 국번
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`
}
