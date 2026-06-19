// 전화번호 입력 정리 — 숫자만 남기고 마켓별 형식으로 하이픈 자동 삽입
// 연락처 칸에 글자가 입력되던 문제를 막기 위해 onChange에서 사용한다.
//
// 마켓별 규칙이 다르므로(한국/일본) lib/i18n/locale.ts 의 phoneCountry로 분기한다.
// 한국 동작은 기존과 100% 동일하다.

import { getMarket } from '@/lib/i18n/locale'

/** 숫자 이외 문자 제거 */
export const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')

/**
 * 현재 마켓 규칙에 맞춰 전화번호에 하이픈을 자동 삽입한다(onChange용).
 */
export function formatPhone(value: string): string {
  return getMarket().phoneCountry === 'JP' ? formatPhoneJP(value) : formatPhoneKR(value)
}

/**
 * 한국 전화번호 자동 하이픈 포맷
 * - 02(서울 지역번호): 02-1234-5678 / 02-123-4567
 * - 010·070 등 3자리 국번 휴대폰·일반: 010-1234-5678 / 0xx-123-4567
 */
export function formatPhoneKR(value: string): string {
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

/**
 * 일본 전화번호 자동 하이픈 포맷(기본 규칙)
 * - 휴대폰 090/080/070: 090-1234-5678
 * - 도쿄 지역번호 03: 03-1234-5678
 * 일본 진출 시 실제 번호 체계에 맞춰 세부 보정한다(현재는 기본 분할).
 */
export function formatPhoneJP(value: string): string {
  const d = digitsOnly(value).slice(0, 11)
  // 휴대폰(11자리, 0[789]0 시작)
  if (/^0[789]0/.test(d)) {
    if (d.length <= 3) return d
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  }
  // 도쿄 등 2자리 지역번호(03/06)
  if (/^0[36]/.test(d)) {
    if (d.length <= 2) return d
    if (d.length <= 6) return `${d.slice(0, 2)}-${d.slice(2)}`
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`
  }
  // 그 외 일반 — 단순 분할
  if (d.length <= 4) return d
  if (d.length <= 8) return `${d.slice(0, 4)}-${d.slice(4)}`
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`
}
