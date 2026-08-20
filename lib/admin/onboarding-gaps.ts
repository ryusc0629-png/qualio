import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 가입한 고객사가 '첫 견적 발송'까지 가는 길에서 어디에 멈춰 있는지.
 *
 * 왜 이 화면이 필요한가: 우리 북극성은 가입 수가 아니라 **첫 견적을 보낸 업체 수**다.
 * 그런데 2026-08-21 기준 가입 32곳 중 견적을 한 장이라도 보낸 곳은 1곳(다트클린=본사 업체)뿐이었다.
 * 서비스 항목까지 등록한 곳은 13곳이나 되는데 거기서 전부 멈춰 있었고, 심지어 손님 문의가
 * 실제로 들어온 4곳조차 견적이 0건이었다. 이 숫자는 SQL을 직접 두드려야만 보였다.
 *
 * ⚠️ 예전 이 파일은 '세팅이 안 끝난 곳'만 골라냈다(missing이 비면 목록에서 제외).
 * 그래서 **세팅을 다 끝내고 아무것도 안 하는 업체가 목록에서 사라졌다** — 지금 가장 큰 구멍인데
 * 화면에는 안 보였다. 그래서 '못 끝낸 세팅' 목록이 아니라 '견적까지 못 간 곳' 목록으로 넓혔다.
 * 세팅 항목만 다시 보는 형태로 되돌리지 말 것.
 */

/** 무엇에 막혀 있는가 — 연락할 순서를 정하는 기준 */
export type Blocker =
  /** 손님 문의가 들어왔는데 견적을 안 보냄. 돈이 문 앞에서 새는 중이라 제일 급하다 */
  | 'lead-waiting'
  /** 서비스 항목이 없어 견적을 만들 수단 자체가 없음 */
  | 'no-setup'
  /** 세팅은 끝났는데 견적이 0건 — 쓸 줄 모르거나, 쓸 일이 아직 없거나 */
  | 'no-quote'

export interface ActivationRow {
  businessId: string
  name: string
  phone: string | null
  createdAt: string
  daysSinceSignup: number
  serviceCount: number
  leadCount: number
  quoteCount: number
  bookingCount: number
  /** 마지막으로 화면을 연 시각 — 가입일과 같으면 그날 이후 안 들어온 것 */
  lastActiveAt: string | null
  blocker: Blocker
  /** 아직 안 채운 세팅 항목 (사람이 읽는 라벨) */
  missing: string[]
}

export interface ActivationFunnel {
  /** 단계별 업체 수 — 가입 → 서비스 등록 → 문의 도착 → 견적 발송 → 예약 */
  signedUp: number
  withService: number
  withLead: number
  withQuote: number
  withBooking: number
  /** 견적까지 못 간 곳 (연락할 순서대로) */
  rows: ActivationRow[]
}

/** 가입 후 이 시간이 지나야 연락 대상으로 본다 — 가입 당일에 전화하면 부담스럽다 */
const GRACE_HOURS = 24

/** 문의가 들어온 곳은 급하니 유예 없이 바로 잡는다 */
const BLOCKER_ORDER: Record<Blocker, number> = {
  'lead-waiting': 0,
  'no-setup': 1,
  'no-quote': 2,
}

export async function getActivationFunnel(): Promise<ActivationFunnel> {
  const db = createServiceClient()
  // activity_events는 database.ts에 타입이 없어 느슨한 클라이언트로 접근한다
  const looseDb = db as unknown as SupabaseClient

  const [bizRes, servicesRes, leadsRes, quotesRes, bookingsRes, eventsRes] = await Promise.all([
    db.from('businesses').select('id, name, phone, address, description, slug, created_at' as never),
    db.from('service_items').select('business_id').is('deleted_at', null),
    looseDb.from('leads').select('business_id'),
    db.from('quotes').select('business_id'),
    db.from('bookings').select('business_id'),
    // 마지막 접속 시각만 필요하므로 최신순으로 훑어 첫 등장만 취한다
    looseDb
      .from('activity_events')
      .select('business_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10000),
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

  const countBy = (rows: { business_id: string | null }[] | null): Map<string, number> => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) {
      if (!r.business_id) continue
      m.set(r.business_id, (m.get(r.business_id) ?? 0) + 1)
    }
    return m
  }

  const services = countBy(servicesRes.data as { business_id: string | null }[] | null)
  const leads = countBy(leadsRes.data as { business_id: string | null }[] | null)
  const quotes = countBy(quotesRes.data as { business_id: string | null }[] | null)
  const bookings = countBy(bookingsRes.data as { business_id: string | null }[] | null)

  // 최신순이라 각 업체의 첫 등장이 곧 마지막 활동 시각
  const lastActive = new Map<string, string>()
  for (const e of (eventsRes.data ?? []) as { business_id: string | null; created_at: string }[]) {
    if (!e.business_id || lastActive.has(e.business_id)) continue
    lastActive.set(e.business_id, e.created_at)
  }

  const now = Date.now()
  const rows: ActivationRow[] = []

  for (const b of businesses) {
    const serviceCount = services.get(b.id) ?? 0
    const leadCount = leads.get(b.id) ?? 0
    const quoteCount = quotes.get(b.id) ?? 0
    const bookingCount = bookings.get(b.id) ?? 0

    // 견적을 한 장이라도 보냈으면 이 목록의 대상이 아니다 — 이미 건너온 곳이다
    if (quoteCount > 0) continue

    const hours = (now - new Date(b.created_at).getTime()) / 36e5
    // 문의가 들어온 곳은 가입 당일이라도 급하다(손님을 기다리게 두는 중)
    if (hours < GRACE_HOURS && leadCount === 0) continue

    const missing: string[] = []
    if (serviceCount === 0) missing.push('서비스 항목')
    if (!b.phone) missing.push('업체 전화번호')
    if (!b.address) missing.push('업체 주소')
    if (!b.slug) missing.push('홈페이지 주소')
    if (!b.description) missing.push('업체 소개글')

    const blocker: Blocker =
      leadCount > 0 ? 'lead-waiting' : serviceCount === 0 ? 'no-setup' : 'no-quote'

    rows.push({
      businessId: b.id,
      name: b.name,
      phone: b.phone,
      createdAt: b.created_at,
      daysSinceSignup: Math.floor(hours / 24),
      serviceCount,
      leadCount,
      quoteCount,
      bookingCount,
      lastActiveAt: lastActive.get(b.id) ?? null,
      blocker,
      missing,
    })
  }

  // 급한 순서 → 같은 급함 안에서는 문의가 많은 곳 → 최근 가입 순
  rows.sort(
    (a, b) =>
      BLOCKER_ORDER[a.blocker] - BLOCKER_ORDER[b.blocker] ||
      b.leadCount - a.leadCount ||
      (a.createdAt < b.createdAt ? 1 : -1),
  )

  const has = (m: Map<string, number>) => businesses.filter((b) => (m.get(b.id) ?? 0) > 0).length

  return {
    signedUp: businesses.length,
    withService: has(services),
    withLead: has(leads),
    withQuote: has(quotes),
    withBooking: has(bookings),
    rows,
  }
}
