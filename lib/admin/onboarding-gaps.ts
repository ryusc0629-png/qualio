import { createServiceClient } from '@/lib/supabase/server'

/**
 * 첫 세팅을 못 끝낸 고객사만 추린다 — "연락할 곳"을 자동으로 골라주는 목록.
 *
 * 왜 필요한가: 100곳이 들어와도 실제로 도움이 필요한 곳은 일부다.
 * 전부에게 연락하면 시간이 녹고, 아무에게도 안 하면 조용히 이탈한다.
 * 가입만 하고 서비스 항목조차 안 넣은 곳이 이탈 1순위라 여기를 먼저 잡는다.
 */

export interface OnboardingGapRow {
  businessId: string
  name: string
  phone: string | null
  createdAt: string
  hoursSinceSignup: number
  /** 못 끝낸 항목 (사람이 읽는 라벨) */
  missing: string[]
  /** 가입 후 한 번이라도 견적·예약을 만들었는지 */
  hasActivity: boolean
}

/** 가입 후 이 시간이 지나도록 세팅이 안 끝났으면 연락 대상으로 본다 */
const GRACE_HOURS = 24

export async function getOnboardingGaps(): Promise<OnboardingGapRow[]> {
  const db = createServiceClient()

  const [bizRes, servicesRes, quotesRes, bookingsRes] = await Promise.all([
    db.from('businesses').select('id, name, phone, address, description, slug, created_at' as never),
    db.from('service_items').select('business_id').is('deleted_at', null),
    db.from('quotes').select('business_id'),
    db.from('bookings').select('business_id'),
  ])

  const businesses = (bizRes.data ?? []) as unknown as {
    id: string
    name: string
    phone: string | null
    address: string | null
    description: string | null
    slug: string | null
    created_at: string
  }[]

  const withService = new Set((servicesRes.data ?? []).map((s) => s.business_id))
  const withQuote = new Set((quotesRes.data ?? []).map((q) => q.business_id))
  const withBooking = new Set((bookingsRes.data ?? []).map((b) => b.business_id).filter(Boolean) as string[])

  const now = Date.now()
  const rows: OnboardingGapRow[] = []

  for (const b of businesses) {
    const hours = (now - new Date(b.created_at).getTime()) / 36e5
    if (hours < GRACE_HOURS) continue // 아직 여유를 준다 — 가입 당일에 전화하면 부담스럽다

    const missing: string[] = []
    if (!withService.has(b.id)) missing.push('서비스 항목')
    if (!b.phone) missing.push('업체 전화번호')
    if (!b.address) missing.push('업체 주소')
    if (!b.slug) missing.push('홍보 페이지 주소')
    if (!b.description) missing.push('업체 소개글')

    if (missing.length === 0) continue

    rows.push({
      businessId: b.id,
      name: b.name,
      phone: b.phone,
      createdAt: b.created_at,
      hoursSinceSignup: Math.floor(hours),
      missing,
      hasActivity: withQuote.has(b.id) || withBooking.has(b.id),
    })
  }

  // 못 끝낸 게 많고(=막혀 있고), 최근에 가입한 곳부터 — 지금 연락해야 살아나는 순서
  rows.sort((a, b) => b.missing.length - a.missing.length || (a.createdAt < b.createdAt ? 1 : -1))
  return rows
}
