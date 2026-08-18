// '앞으로 손봐야 할 것'을 몇 달 뒤에 알릴지 계산한다.
//
// 보고서를 쓴 날로부터 N개월 뒤 오전 9시(KST)로 잡는다.
// 시각을 붙이는 이유: 날짜만 두면 크론이 도는 시점(UTC 자정 근처)에 따라
// 하루 일찍/늦게 잡힐 수 있다.
export function addMonths(months: number, from: Date = new Date()): string {
  const kst = new Date(from.getTime() + 9 * 60 * 60 * 1000)
  const due = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + months, kst.getUTCDate(), 0, 0, 0))
  // KST 09:00 = UTC 00:00
  return due.toISOString()
}

/** 저장된 기한이 지금부터 몇 달 뒤인지 되짚는다(화면에서 버튼을 다시 선택해 두기 위함) */
export function monthsUntil(dueIso: string | null): number | null {
  if (!dueIso) return null
  const now = Date.now()
  const due = new Date(dueIso).getTime()
  const months = Math.round((due - now) / (30 * 24 * 60 * 60 * 1000))
  // 화면에 있는 선택지로만 되돌린다 — 없는 값이면 가장 가까운 것
  if (months <= 0) return 0
  if (months <= 4) return 3
  if (months <= 9) return 6
  return 12
}
