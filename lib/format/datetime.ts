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

/**
 * 입력 폼에서 온 '타임존이 없는' 시각 문자열(datetime-local의 "2026-08-01T08:00" 등)을
 * 시장 타임존(기본 KST)의 벽시계 시각으로 해석해 UTC ISO 문자열로 변환한다.
 *
 * 왜 이렇게 쓰는가:
 *   Vercel 서버는 UTC라 `new Date("2026-08-01T08:00").toISOString()`이 08:00을 UTC로 파싱해
 *   저장 후 KST 표시에서 +9시간(17:00) 밀린다. 사용자가 고른 08:00은 KST 벽시계 시각이므로
 *   시장 타임존 오프셋을 적용해 저장해야 한다.
 *   이미 타임존(Z 또는 ±HH:MM)이 붙은 문자열은 그대로 파싱한다 — 정상값 재전송·드래그 이동처럼
 *   오프셋이 이미 붙은 입력을 깨뜨리지 않는다.
 */
export function inputToUtcIso(input: string): string {
  const s = input.trim()
  // 타임존이 없는 벽시계 문자열만 시장 타임존으로 해석 (그 외는 그대로)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return new Date(s).toISOString()
  }
  const { timeZone } = getMarket()
  const asIfUtc = new Date(`${s}Z`)                 // 벽시계를 일단 UTC로 가정
  const offsetMs = tzOffsetMs(asIfUtc, timeZone)    // 그 순간 시장 타임존의 UTC 오프셋(KST=+9h)
  return new Date(asIfUtc.getTime() - offsetMs).toISOString()
}

/** 주어진 순간에 특정 타임존이 UTC로부터 벗어난 정도(ms). KST면 항상 +9시간. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, number> = {}
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!)
  return asUtc - date.getTime()
}
