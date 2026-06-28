import { parseFrequency } from '@/lib/utils/frequency'

// 정기계약 주기를 바탕으로 방문 '날짜'(YYYY-MM-DD) 목록을 만든다.
// 시작일·종료일·롤링 윈도우 반영은 호출부에서 from/to로 넘긴다. (순수 함수 — DB 접근 없음)

// 한글 요일 → JS getUTCDay (일=0 ... 토=6)
const WEEKDAY: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
}

function toUTCDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

/**
 * [fromStr, toStr] 구간(둘 다 포함, YYYY-MM-DD)의 방문 날짜 목록.
 * - weekly: 지정 요일마다 매주 (요일 미지정 시 from 요일 기준 주 1회)
 * - monthly: 30/count 간격 (count회/월을 균등 분할)
 * - 레거시 문자열: weekly(주1회) / biweekly(14일) / monthly(30일)
 * maxCount로 폭주를 방지한다.
 */
export function computeVisitDates(
  frequency: string,
  fromStr: string,
  toStr: string,
  maxCount = 120,
): string[] {
  const from = toUTCDate(fromStr)
  const to = toUTCDate(toStr)
  if (from > to) return []

  const dates: string[] = []
  const parsed = parseFrequency(frequency)
  const legacy = parsed ? null : frequency

  // 주 단위 — 지정 요일마다 매주
  if (parsed?.type === 'weekly' || legacy === 'weekly') {
    const days =
      parsed?.days && parsed.days.length > 0
        ? parsed.days.map((d) => WEEKDAY[d]).filter((n): n is number => n !== undefined)
        : [from.getUTCDay()] // 요일 미지정 → 시작 요일 기준 주 1회
    const target = new Set(days)
    for (let c = new Date(from); c <= to && dates.length < maxCount; c = addDays(c, 1)) {
      if (target.has(c.getUTCDay())) dates.push(ymd(c))
    }
    return dates
  }

  // 간격(일) 기반 — monthly(count) 및 레거시 biweekly/monthly
  let intervalDays: number
  if (parsed?.type === 'monthly') {
    intervalDays = Math.max(1, Math.round(30 / Math.max(1, parsed.count)))
  } else if (legacy === 'biweekly') {
    intervalDays = 14
  } else {
    intervalDays = 30 // 레거시 'monthly' 또는 알 수 없는 값
  }
  for (let c = new Date(from); c <= to && dates.length < maxCount; c = addDays(c, intervalDays)) {
    dates.push(ymd(c))
  }
  return dates
}
