import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

// 본사 메뉴 옆에 붙는 '처리할 일' 개수.
//
// 왜 필요한가: 나중에 직원이 이 화면을 쓰게 되면, 오늘 뭘 해야 하는지를 메뉴를 하나씩
// 열어보며 확인하게 된다. 숫자를 메뉴에 붙여두면 열어볼 곳만 열게 된다.
// 실패해도 화면은 떠야 하므로 개수 조회가 깨지면 0으로 둔다.

export interface AdminNavCounts {
  requests: number
  bugReports: number
  onboardingGaps: number
  domainOutreach: number
  academyInquiries: number
}

const EMPTY: AdminNavCounts = {
  requests: 0,
  bugReports: 0,
  onboardingGaps: 0,
  domainOutreach: 0,
  academyInquiries: 0,
}

export async function getAdminNavCounts(): Promise<AdminNavCounts> {
  try {
    const db = createServiceClient()
    const looseDb = db as unknown as SupabaseClient

    const [requests, bugs, academy, gaps, outreach] = await Promise.all([
      looseDb
        .from('business_requests')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'done'),
      looseDb
        .from('bug_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new'),
      looseDb
        .from('academy_inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('contacted', false),
      // 아래 둘은 계산이 필요해 각자 모듈에서 가져온다
      import('@/lib/admin/onboarding-gaps').then((m) => m.getOnboardingGaps()),
      import('@/lib/admin/domain-outreach').then((m) => m.getDomainOutreachTargets()),
    ])

    return {
      requests: requests.count ?? 0,
      bugReports: bugs.count ?? 0,
      academyInquiries: academy.count ?? 0,
      onboardingGaps: gaps.length,
      domainOutreach: outreach.filter((t) => t.dueNow).length,
    }
  } catch (e) {
    console.error('[AdminNav] 처리할 일 개수 조회 실패:', e)
    return EMPTY
  }
}
