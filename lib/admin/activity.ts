import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

// 경로 → 사람이 읽는 기능 이름. 구체적인 경로를 먼저 두고, /dashboard(홈)는 맨 뒤에서 처리.
const SECTION_PREFIXES: { prefix: string; label: string }[] = [
  { prefix: '/dashboard/schedule', label: '일정·배정' },
  { prefix: '/dashboard/attendance', label: '근태·문단속' },
  { prefix: '/dashboard/marketing', label: '마케팅' },
  { prefix: '/dashboard/clients', label: '고객 관리' },
  { prefix: '/dashboard/finance', label: '매출·지출' },
  { prefix: '/dashboard/payroll', label: '급여' },
  { prefix: '/dashboard/roadmap', label: '영업 동선' },
  { prefix: '/dashboard/services', label: '서비스' },
  { prefix: '/dashboard/tiers', label: '가격 3단계' },
  { prefix: '/dashboard/settings', label: '설정' },
]

// 경로 하나를 기능 이름으로 변환
export function sectionLabel(path: string): string {
  for (const s of SECTION_PREFIXES) {
    if (path === s.prefix || path.startsWith(s.prefix + '/')) return s.label
  }
  if (path === '/dashboard') return '홈'
  // 매핑에 없는 대시보드 하위 경로는 경로 꼬리를 그대로 보여준다
  return path.replace('/dashboard', '') || '홈'
}

// 서울 기준 날짜 문자열(YYYY-MM-DD) — 활동 일수·오늘/이번주 판별용
function kstDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

export interface ActivityFeedItem {
  at: string
  businessId: string
  businessName: string
  section: string
}

export interface MemberUsage {
  businessId: string
  businessName: string
  lastSeenAt: string | null
  totalViews: number
  activeDays: number
  topSections: { label: string; count: number }[]
}

export interface UsageOverview {
  feed: ActivityFeedItem[]
  members: MemberUsage[]
  todayActiveCount: number
  weekActiveCount: number
  windowDays: number
}

interface EventRow {
  business_id: string
  path: string
  created_at: string
}

/**
 * 본사 '사용 현황' 화면 데이터.
 * 최근 windowDays(기본 14일)의 활동 이벤트를 모아
 * 실시간 피드 + 업체(회원)별 사용 요약으로 조립한다.
 * 베타 규모를 가정해 최근 이벤트를 한 번에 읽어 메모리에서 집계한다.
 */
export async function getUsageOverview(windowDays = 14): Promise<UsageOverview> {
  // activity_events 타입이 database.ts에 없어 느슨한 클라이언트로 접근
  const db = createServiceClient() as unknown as SupabaseClient
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()

  const [eventsRes, bizRes] = await Promise.all([
    db
      .from('activity_events')
      .select('business_id, path, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10000),
    db.from('businesses').select('id, name'),
  ])

  const events = (eventsRes.data ?? []) as EventRow[]
  const nameById = new Map<string, string>()
  for (const b of (bizRes.data ?? []) as { id: string; name: string }[]) nameById.set(b.id, b.name)

  // 실시간 피드 — 최신 60건 (events는 이미 최신순)
  const feed: ActivityFeedItem[] = events.slice(0, 60).map((e) => ({
    at: e.created_at,
    businessId: e.business_id,
    businessName: nameById.get(e.business_id) ?? '(이름 없음)',
    section: sectionLabel(e.path),
  }))

  // 업체별 집계
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const weekAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const todayActive = new Set<string>()
  const weekActive = new Set<string>()

  interface Acc {
    total: number
    lastSeenAt: string
    days: Set<string>
    sections: Map<string, number>
  }
  const accByBiz = new Map<string, Acc>()

  for (const e of events) {
    const biz = e.business_id
    if (!biz) continue
    let acc = accByBiz.get(biz)
    if (!acc) {
      // events가 최신순이므로 첫 등장 시각이 곧 마지막 사용 시각
      acc = { total: 0, lastSeenAt: e.created_at, days: new Set(), sections: new Map() }
      accByBiz.set(biz, acc)
    }
    acc.total += 1
    acc.days.add(kstDateStr(e.created_at))
    const label = sectionLabel(e.path)
    acc.sections.set(label, (acc.sections.get(label) ?? 0) + 1)

    if (kstDateStr(e.created_at) === todayStr) todayActive.add(biz)
    if (e.created_at >= weekAgoIso) weekActive.add(biz)
  }

  const members: MemberUsage[] = Array.from(accByBiz.entries())
    .map(([businessId, acc]) => ({
      businessId,
      businessName: nameById.get(businessId) ?? '(이름 없음)',
      lastSeenAt: acc.lastSeenAt,
      totalViews: acc.total,
      activeDays: acc.days.size,
      topSections: Array.from(acc.sections.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4),
    }))
    // 최근 사용 순
    .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1))

  return {
    feed,
    members,
    todayActiveCount: todayActive.size,
    weekActiveCount: weekActive.size,
    windowDays,
  }
}
