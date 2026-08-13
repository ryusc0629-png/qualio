import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { PLANS } from '@/lib/config/plans'
import type { PlanId } from '@/lib/config/plans'

/**
 * 본사 CS용 고객사 진단 정보.
 *
 * 왜 필요한가: "안 돼요"라는 전화가 오면 상황을 말로 캐물어야 했다.
 * 대부분의 원인은 첫 세팅이 덜 된 것(서비스 0개, 홈페이지 주소 없음 등)이라,
 * 그 상태를 한 화면에서 보면 통화 시간이 크게 줄어든다.
 *
 * 읽기 전용이다 — 이 화면에서는 어떤 값도 바꾸지 않는다.
 */

export interface SetupCheck {
  label: string
  done: boolean
  /** 안 된 경우 사장님께 안내할 다음 행동 */
  hint: string
}

export interface RecentBooking {
  id: string
  customerName: string
  scheduledAt: string | null
  status: string
  finalPrice: number | null
}

export interface RecentQuote {
  id: string
  customerName: string | null
  createdAt: string
  status: string
  isTest: boolean
}

export interface RecentBugReport {
  id: string
  message: string
  pageUrl: string | null
  createdAt: string
  status: string | null
}

export interface BusinessDetail {
  businessId: string
  name: string
  phone: string | null
  address: string | null
  slug: string | null
  createdAt: string
  ownerName: string | null
  ownerEmail: string | null
  betaNumber: number | null
  lifetimeDiscountRate: number
  planLabel: string
  planStatus: string | null
  setupChecks: SetupCheck[]
  counts: {
    services: number
    quotes: number
    bookings: number
    customers: number
    contracts: number
    workers: number
  }
  lastActivityAt: string | null
  recentBookings: RecentBooking[]
  recentQuotes: RecentQuote[]
  recentBugReports: RecentBugReport[]
}

export async function getBusinessDetail(businessId: string): Promise<BusinessDetail | null> {
  const db = createServiceClient()
  const loose = db as unknown as SupabaseClient

  const { data: biz } = (await db
    .from('businesses')
    .select(
      'id, name, phone, address, description, slug, created_at, owner_id, hero_image_url, service_areas, beta_number, lifetime_discount_rate' as never,
    )
    .eq('id', businessId)
    .maybeSingle()) as unknown as {
      data: {
        id: string
        name: string
        phone: string | null
        address: string | null
        description: string | null
        slug: string | null
        created_at: string
        owner_id: string
        hero_image_url: string | null
        service_areas: string[] | null
        beta_number: number | null
        lifetime_discount_rate: number | null
      } | null
    }

  if (!biz) return null

  const [
    profileRes,
    subRes,
    servicesRes,
    quotesRes,
    bookingsRes,
    customersRes,
    contractsRes,
    workersRes,
    recentBookingsRes,
    recentQuotesRes,
    bugReportsRes,
  ] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', biz.owner_id).maybeSingle(),
    db.from('subscriptions').select('plan, status').eq('business_id', businessId).maybeSingle(),
    db.from('service_items').select('id', { count: 'exact', head: true }).eq('business_id', businessId).is('deleted_at', null),
    db.from('quotes').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('contracts').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    // workers는 database.ts 타입에 아직 없어 loose 클라이언트로 접근
    loose.from('workers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('bookings')
      .select('id, customer_name, scheduled_at, status, final_price')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5),
    db.from('quotes')
      .select('id, customer_name, created_at, status, is_test')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5),
    loose.from('bug_reports')
      .select('id, message, page_url, created_at, status')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // 이메일은 auth에서 (베타 규모라 1페이지로 충분)
  const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const ownerEmail = users?.users.find((u) => u.id === biz.owner_id)?.email ?? null

  const serviceCount = servicesRes.count ?? 0
  const plan = (subRes.data?.plan ?? null) as PlanId | null

  // 첫 세팅 체크 — CS 전화의 대부분이 여기서 걸린다
  const setupChecks: SetupCheck[] = [
    {
      label: '서비스 항목 등록',
      done: serviceCount > 0,
      hint: '설정 → 서비스에서 청소 항목과 가격을 먼저 넣어야 견적이 만들어져요',
    },
    {
      label: '업체 전화번호',
      done: Boolean(biz.phone),
      hint: '고객이 전화를 걸 수 없어요. 설정 → 기본 정보',
    },
    {
      label: '업체 주소',
      done: Boolean(biz.address),
      hint: '지역 검색 노출과 홈페이지에 필요해요. 설정 → 기본 정보',
    },
    {
      label: '업체 소개글',
      done: Boolean(biz.description),
      hint: '홈페이지가 비어 보여요. 설정 → 기본 정보',
    },
    {
      label: '홍보 페이지 주소',
      done: Boolean(biz.slug),
      hint: '홈페이지 주소가 없어 링크를 못 보내요. 설정 → 홍보 페이지 주소',
    },
    {
      label: '출장 지역',
      done: Array.isArray(biz.service_areas) && biz.service_areas.length > 0,
      hint: '어디까지 가는지 안 정해져 있어요. 설정 → 출장 지역',
    },
    {
      label: '대표 사진(히어로)',
      done: Boolean(biz.hero_image_url),
      hint: '홈페이지 첫 화면이 허전해요. 설정 → 홈페이지 꾸미기',
    },
  ]

  const recentBookings: RecentBooking[] = (recentBookingsRes.data ?? []).map((b) => ({
    id: b.id,
    customerName: b.customer_name ?? '이름 없음',
    scheduledAt: b.scheduled_at,
    status: b.status,
    finalPrice: b.final_price,
  }))

  const recentQuotes: RecentQuote[] = ((recentQuotesRes.data ?? []) as unknown as {
    id: string
    customer_name: string | null
    created_at: string
    status: string
    is_test: boolean | null
  }[]).map((q) => ({
    id: q.id,
    customerName: q.customer_name,
    createdAt: q.created_at,
    status: q.status,
    isTest: Boolean(q.is_test),
  }))

  const recentBugReports: RecentBugReport[] = ((bugReportsRes.data ?? []) as unknown as {
    id: string
    message: string
    page_url: string | null
    created_at: string
    status: string | null
  }[]).map((r) => ({
    id: r.id,
    message: r.message,
    pageUrl: r.page_url,
    createdAt: r.created_at,
    status: r.status,
  }))

  const lastActivityAt =
    [recentBookings[0]?.scheduledAt ?? null, recentQuotes[0]?.createdAt ?? null]
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null

  return {
    businessId: biz.id,
    name: biz.name,
    phone: biz.phone,
    address: biz.address,
    slug: biz.slug,
    createdAt: biz.created_at,
    ownerName: profileRes.data?.full_name ?? null,
    ownerEmail,
    betaNumber: biz.beta_number,
    lifetimeDiscountRate: biz.lifetime_discount_rate ?? 0,
    planLabel: plan ? (PLANS[plan]?.label ?? plan) : '무료',
    planStatus: subRes.data?.status ?? null,
    setupChecks,
    counts: {
      services: serviceCount,
      quotes: quotesRes.count ?? 0,
      bookings: bookingsRes.count ?? 0,
      customers: customersRes.count ?? 0,
      contracts: contractsRes.count ?? 0,
      workers: workersRes.count ?? 0,
    },
    lastActivityAt,
    recentBookings,
    recentQuotes,
    recentBugReports,
  }
}
