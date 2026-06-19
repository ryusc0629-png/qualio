// 금액 포맷 — 마켓 설정(lib/i18n/locale.ts)에 따라 통화 표기를 자동 처리한다.
//
// 왜 이렇게 쓰는가:
//   기존 코드는 `price.toLocaleString('ko-KR') + '원'`을 100곳 넘게 직접 작성했다.
//   해외 진출 시 통화 기호('원'→'¥')와 위치(접미→접두)를 한 곳에서 바꾸기 위해
//   금액 표시는 반드시 이 함수를 거친다.
//
//   한국 출력은 기존과 100% 동일하다(예: 39000 → "39,000원").

import { getMarket } from '@/lib/i18n/locale'

/**
 * 숫자를 현재 마켓의 통화 문자열로 변환한다.
 * @example formatMoney(39000) // 한국: "39,000원" / 일본: "¥39,000"
 */
export function formatMoney(amount: number): string {
  const m = getMarket()
  const grouped = new Intl.NumberFormat(m.locale).format(amount)
  return m.currencyPosition === 'suffix'
    ? `${grouped}${m.currencySymbol}`
    : `${m.currencySymbol}${grouped}`
}

/**
 * 통화 기호 없이 천 단위 구분만 적용한다(기호를 따로 배치하는 화면용).
 * @example formatAmount(39000) // "39,000"
 */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat(getMarket().locale).format(amount)
}
