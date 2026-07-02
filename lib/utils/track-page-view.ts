import 'server-only'
import { headers } from 'next/headers'
import { detectViewSource } from '@/lib/utils/detect-view-source'
import { normalizeChannel } from '@/lib/utils/marketing-channels'
import { createClient, type createServiceClient } from '@/lib/supabase/server'

type PageType = 'quote' | 'brand_home'

// 로그인한 업체 주인(같은 소속 직원 포함)이 자기 업체 페이지를 보는지 판별.
// 사장님이 본인 견적폼·홈·블로그를 테스트할 때 통계가 부풀지 않도록 방문/조회/퍼널 추적에서 공통으로 제외.
// 주의: 비로그인 상태(시크릿창·개인폰)에서 테스트하면 감지 불가 — 로그인 세션 기준의 실무적 제외.
export async function isBusinessInsiderViewing(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
): Promise<boolean> {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return false
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    return profile?.business_id === businessId
  } catch {
    return false
  }
}

// 공개 페이지(견적·브랜드 홈) 방문을 page_views에 기록
// — referrer/User-Agent로 유입 소스를 감지해 함께 저장
// — 추적 실패가 페이지 렌더를 막지 않도록 try/catch로 감쌈
export async function trackPageView(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  pageType: PageType,
  channel?: string | null,
): Promise<void> {
  try {
    // 로그인한 업체 주인이 자기 페이지를 보는 경우는 통계에서 제외 — 가짜 '직접 방문' 방지
    if (await isBusinessInsiderViewing(db, businessId)) return

    const h = await headers()
    const referer = h.get('referer') ?? ''
    const userAgent = h.get('user-agent') ?? ''
    const source = detectViewSource(referer, userAgent)
    const ch = normalizeChannel(channel)
    // page_views 타입이 database.ts에 아직 없어 단언 사용
    await db.from('page_views' as never).insert({ business_id: businessId, page_type: pageType, source, channel: ch } as never)
  } catch (error) {
    console.error('[PageView] 방문 기록 실패:', error)
  }
}
