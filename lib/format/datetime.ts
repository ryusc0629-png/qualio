// 날짜/시간 포맷 — 마켓 설정(lib/i18n/locale.ts)의 로케일·타임존을 적용한다.
//
// 왜 이렇게 쓰는가:
//   Vercel 서버는 UTC로 동작하므로 표시용 타임존을 반드시 명시해야 한다.
//   (생략하면 로컬에선 정상, 배포 후 9시간 밀림)
//   기존엔 `toLocaleTimeString('ko-KR', { ..., timeZone: 'Asia/Seoul' })`를
//   곳곳에 직접 작성했다. 해외 진출 시 타임존을 한 곳에서 바꾸기 위해
//   날짜/시간 표시는 이 함수들을 거친다.
//
//   options 인자로 Intl 옵션을 그대로 덮어쓸 수 있다(timeZone/locale은 자동 주입).

import { getMarket } from '@/lib/i18n/locale'

type DateInput = Date | string | number

/** 날짜 — 기본 "2026년 6월 19일" 형태(한국 기준) */
export function formatDate(
  input: DateInput,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  const m = getMarket()
  return new Date(input).toLocaleDateString(m.locale, { timeZone: m.timeZone, ...options })
}

/** 시간 — 기본 "오후 2:30" 형태(한국 기준) */
export function formatTime(
  input: DateInput,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
  const m = getMarket()
  return new Date(input).toLocaleTimeString(m.locale, { timeZone: m.timeZone, ...options })
}

/** 날짜+시간 — 기본 "2026년 6월 19일 오후 2:30" 형태(한국 기준) */
export function formatDateTime(
  input: DateInput,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  const m = getMarket()
  return new Date(input).toLocaleString(m.locale, { timeZone: m.timeZone, ...options })
}
