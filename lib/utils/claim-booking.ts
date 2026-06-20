import { createServiceClient } from '@/lib/supabase/server'

type Db = ReturnType<typeof createServiceClient>

// 클레임에 연결된 작업(booking_id) → "서비스 · 날짜" 라벨 맵을 만든다.
// 클레임 카드에 "어떤 작업 관련인지" 보여주기 위함. booking_id가 없으면 제외.
export async function getClaimBookingLabels(
  db: Db,
  businessId: string,
  bookingIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(bookingIds.filter(Boolean))] as string[]
  const map = new Map<string, string>()
  if (ids.length === 0) return map

  const { data } = await db
    .from('bookings')
    .select('id, scheduled_at, memo, quotes!quote_id(cleaning_type)')
    .eq('business_id', businessId)
    .in('id', ids)

  const rows = (data ?? []) as Array<{
    id: string
    scheduled_at: string
    memo: string | null
    quotes: { cleaning_type: string | null } | null
  }>

  for (const b of rows) {
    const service = b.quotes?.cleaning_type ?? b.memo ?? '작업'
    const date = new Date(b.scheduled_at).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Seoul',
    })
    map.set(b.id, `${service} · ${date}`)
  }
  return map
}
