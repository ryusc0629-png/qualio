import { createServiceClient } from '@/lib/supabase/server'
import { PLANS } from '@/lib/config/plans'
import { PAID_SUBSCRIPTION_STATUSES } from '@/lib/admin/metrics'

// PLANS는 특정 플랜 id로만 인덱싱 가능하므로 문자열 조회용으로 완화한 뷰
const PLAN_MAP = PLANS as Record<string, { price: number; label: string }>

// 가입 경로 코드 → 한글 라벨 (지표 대시보드와 동일 기준)
const ACQUISITION_LABELS: Record<string, string> = {
  youtube: '유튜브',
  search: '검색(네이버·구글)',
  referral: '지인 소개',
  sns: '인스타·SNS',
  community: '블로그·카페',
  etc: '기타',
  unknown: '미기록',
}

// 구독 상태 → 한글 라벨
function subStatusLabel(status: string | null): string {
  switch (status) {
    case 'active':
      return '유료(정상)'
    case 'past_due':
      return '결제 밀림'
    case 'canceled':
      return '해지'
    case 'trialing':
      return '체험'
    case null:
    case undefined:
      return '무료(구독없음)'
    default:
      return status
  }
}

export interface CsBusinessRow {
  businessId: string
  name: string
  phone: string | null
  address: string | null
  createdAt: string
  acquisitionLabel: string
  ownerName: string | null
  ownerEmail: string | null
  planLabel: string
  isPaid: boolean
  subStatusLabel: string
  bookingCount: number
  leadCount: number
  lastActivityAt: string | null // 예약·리드 중 가장 최근 활동 시각
}

/**
 * CS용 가입 업체(회원) 명단.
 * 업체 기본정보 + 대표자명 + 이메일 + 플랜/상태 + 활동량(예약·리드 수·최근활동)을 한 줄로 묶어 반환한다.
 * 베타 규모(수백 곳)를 가정해 전량 조회 후 메모리에서 조립한다.
 */
export async function getBusinessesForCs(): Promise<CsBusinessRow[]> {
  const db = createServiceClient()

  const [businessesRes, profilesRes, subsRes, bookingsRes, leadsRes, usersRes] = await Promise.all([
    db.from('businesses').select('id, name, phone, address, created_at, owner_id, acquisition_source' as never),
    db.from('profiles').select('id, full_name'),
    db.from('subscriptions').select('business_id, plan, status'),
    db.from('bookings').select('business_id, created_at'),
    db.from('leads').select('business_id, created_at'),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  const businesses = (businessesRes.data ?? []) as unknown as {
    id: string
    name: string
    phone: string | null
    address: string | null
    created_at: string
    owner_id: string
    acquisition_source: string | null
  }[]

  // 대표자 이름: profiles.id === business.owner_id
  const ownerNameById = new Map<string, string | null>()
  for (const p of profilesRes.data ?? []) ownerNameById.set(p.id, p.full_name)

  // 이메일: auth 유저 id → email
  const emailById = new Map<string, string | null>()
  for (const u of usersRes.data?.users ?? []) emailById.set(u.id, u.email ?? null)

  // 구독: business_id → {plan, status} (가장 최근·유료 우선은 아니고 단순 매핑, 베타 규모 1:1 가정)
  const subByBiz = new Map<string, { plan: string; status: string }>()
  for (const s of subsRes.data ?? []) subByBiz.set(s.business_id, { plan: s.plan, status: s.status })

  // 예약/리드 집계 + 최근 활동 시각
  const bookingCount = new Map<string, number>()
  const lastActivity = new Map<string, string>()
  const bump = (bizId: string, at: string) => {
    const prev = lastActivity.get(bizId)
    if (!prev || at > prev) lastActivity.set(bizId, at)
  }
  for (const b of bookingsRes.data ?? []) {
    if (!b.business_id) continue
    bookingCount.set(b.business_id, (bookingCount.get(b.business_id) ?? 0) + 1)
    if (b.created_at) bump(b.business_id, b.created_at)
  }
  const leadCount = new Map<string, number>()
  for (const l of leadsRes.data ?? []) {
    if (!l.business_id) continue
    leadCount.set(l.business_id, (leadCount.get(l.business_id) ?? 0) + 1)
    if (l.created_at) bump(l.business_id, l.created_at)
  }

  const rows: CsBusinessRow[] = businesses.map((b) => {
    const sub = subByBiz.get(b.id) ?? null
    const isPaid = !!sub && PAID_SUBSCRIPTION_STATUSES.has(sub.status) && (PLAN_MAP[sub.plan]?.price ?? 0) > 0
    return {
      businessId: b.id,
      name: b.name,
      phone: b.phone,
      address: b.address,
      createdAt: b.created_at,
      acquisitionLabel: ACQUISITION_LABELS[b.acquisition_source ?? 'unknown'] ?? b.acquisition_source ?? '미기록',
      ownerName: ownerNameById.get(b.owner_id) ?? null,
      ownerEmail: emailById.get(b.owner_id) ?? null,
      planLabel: sub ? (PLAN_MAP[sub.plan]?.label ?? sub.plan) : '무료',
      isPaid,
      subStatusLabel: subStatusLabel(sub?.status ?? null),
      bookingCount: bookingCount.get(b.id) ?? 0,
      leadCount: leadCount.get(b.id) ?? 0,
      lastActivityAt: lastActivity.get(b.id) ?? null,
    }
  })

  // 최근 가입 순
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return rows
}
