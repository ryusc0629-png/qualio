// 일반(개인) 고객의 "실제 상태"를 견적(quotes)·예약(bookings) 데이터에서 자동 계산
// 거래처 관리 목록·상세·수정 창에서 공용으로 사용

export type LiveStatus = {
  key: string
  label: string
  className: string
  date: string | null // 관련 예약 일시 (있을 때만)
}

// 상태별 표시 메타 (clients 상세/work 페이지 라벨과 톤 통일)
const META: Record<string, { label: string; className: string }> = {
  in_progress: { label: '작업 중',   className: 'bg-amber-100 text-amber-800' },
  confirmed:   { label: '예약 확정',  className: 'bg-blue-100 text-blue-700' },
  quote:       { label: '견적 문의',  className: 'bg-violet-100 text-violet-700' },
  completed:   { label: '완료',      className: 'bg-emerald-100 text-emerald-700' },
}

// 전화번호 정규화 — 숫자만 추출 (010-1234-5678 / 01012345678 형식 혼용 대응)
export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? '').replace(/[^0-9]/g, '')
}

type QuoteLite = { customer_phone: string | null; status: string }
type BookingLite = { customer_phone: string | null; status: string; scheduled_at: string | null }

// 한 고객(전화번호)의 견적·예약을 종합해 현재 상태 1개 도출
// 우선순위: 작업 중 > 예약 확정(가장 가까운 예정) > 견적 문의 > 완료
function derive(quotes: QuoteLite[], bookings: BookingLite[]): LiveStatus | null {
  const inProgress = bookings.find((b) => b.status === 'in_progress')
  if (inProgress) return { key: 'in_progress', ...META.in_progress!, date: inProgress.scheduled_at }

  const confirmed = bookings
    .filter((b) => b.status === 'confirmed')
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))[0]
  if (confirmed) return { key: 'confirmed', ...META.confirmed!, date: confirmed.scheduled_at }

  if (quotes.some((q) => q.status === 'pending')) {
    return { key: 'quote', ...META.quote!, date: null }
  }

  const completed = bookings
    .filter((b) => b.status === 'completed')
    .sort((a, b) => (b.scheduled_at ?? '').localeCompare(a.scheduled_at ?? ''))[0]
  if (completed) return { key: 'completed', ...META.completed!, date: completed.scheduled_at }

  return null
}

// 전화번호 → 현재 상태 맵 생성
export function buildLiveStatusMap(
  quotes: QuoteLite[],
  bookings: BookingLite[],
): Map<string, LiveStatus> {
  const byPhone = new Map<string, { quotes: QuoteLite[]; bookings: BookingLite[] }>()

  for (const q of quotes) {
    const p = normalizePhone(q.customer_phone)
    if (!p) continue
    if (!byPhone.has(p)) byPhone.set(p, { quotes: [], bookings: [] })
    byPhone.get(p)!.quotes.push(q)
  }
  for (const b of bookings) {
    const p = normalizePhone(b.customer_phone)
    if (!p) continue
    if (!byPhone.has(p)) byPhone.set(p, { quotes: [], bookings: [] })
    byPhone.get(p)!.bookings.push(b)
  }

  const result = new Map<string, LiveStatus>()
  for (const [p, data] of byPhone) {
    const status = derive(data.quotes, data.bookings)
    if (status) result.set(p, status)
  }
  return result
}

// 특정 전화번호의 현재 상태 1개 (상세 페이지용)
export function getLiveStatusForPhone(
  phone: string | null | undefined,
  quotes: QuoteLite[],
  bookings: BookingLite[],
): LiveStatus | null {
  const p = normalizePhone(phone)
  if (!p) return null
  const map = buildLiveStatusMap(
    quotes.filter((q) => normalizePhone(q.customer_phone) === p),
    bookings.filter((b) => normalizePhone(b.customer_phone) === p),
  )
  return map.get(p) ?? null
}
